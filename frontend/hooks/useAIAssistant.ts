import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { API_ENDPOINT } from '../../shared/utils/config';
import { optionalGroqApiKeyHeaders } from '../utils/optionalGroqApiKeyHeaders';
import { buildSpeechPrompt } from '../../shared/prompts';
import { useApiAuthHeaders } from '../providers/ApiAuthContext';
import { useLocalClassifier, type ClassificationResult } from './useLocalClassifier';
import { useRealtimeAI, type AnswerData } from './useRealtimeAI';
import { hasRealtimeStreaming, type PlanTier } from '../../shared/constants/planLimits';

export interface Answer {
	bullets: string[];
	spoken: string;
	explanation?: string;
	code?: string;
	codeLanguage?: string;
	sections?: Array<{ title: string; content: string; points?: string[] }>;
}

export interface QuestionDetection {
	isQuestion: boolean;
	question: string;
	confidence: number;
	type: string;
}

export interface UseAIAssistantOptions {
	onQuestionDetected?: () => void;
	onError?: (msg: string) => void;
	onWsTranscript?: (text: string) => void;
	planTier?: PlanTier;
	features?: Record<string, boolean>;
}

function mapWsAnswerToAnswer(data: AnswerData): Answer {
	return {
		bullets: data.bullets || [],
		spoken: data.spoken || '',
		explanation: data.explanation,
		code: data.code,
		codeLanguage: data.codeLanguage,
		sections: data.sections,
	};
}

export function useAIAssistant(options: UseAIAssistantOptions = {}) {
	const { onQuestionDetected, onError, onWsTranscript, planTier = 'free', features } = options;
	const onWsTranscriptRef = useRef(onWsTranscript);
	useEffect(() => {
		onWsTranscriptRef.current = onWsTranscript;
	}, [onWsTranscript]);
	const getAuthHeaders = useApiAuthHeaders();
	const { classify, modelState: classifierState, isReady: classifierReady } = useLocalClassifier();

	const realtimeFeatureEnabled = useMemo(
		() => features?.realtimeStreaming ?? hasRealtimeStreaming(planTier),
		[features?.realtimeStreaming, planTier]
	);

	const [detectedQuestion, setDetectedQuestion] = useState<QuestionDetection | null>(null);
	const [answer, setAnswer] = useState<Answer | null>(null);
	const [liveAnswerTextHttp, setLiveAnswerTextHttp] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);

	const transcriptBufferRef = useRef<string>('');
	const lastProcessedTextRef = useRef<string>('');
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
	const lastClassificationRef = useRef<ClassificationResult | null>(null);
	const speculativeGenRef = useRef(0);
	const wsTranscriptHandlerRef = useRef<(text: string) => void>(() => {});

	const handleWsQuestion = useCallback((q: { question: string; confidence: number; type: string }) => {
		setDetectedQuestion({
			isQuestion: true,
			question: q.question,
			confidence: q.confidence,
			type: q.type,
		});
		setIsProcessing(true);
	}, []);

	const handleWsAnswerComplete = useCallback((data: AnswerData) => {
		const ans = mapWsAnswerToAnswer(data);
		setAnswer(ans);
		setLiveAnswerTextHttp('');
		setIsProcessing(false);
		if (ans.spoken) playSpeechRef.current(ans.spoken);
		onQuestionDetectedRef.current?.();
		transcriptBufferRef.current = transcriptBufferRef.current.slice(-20);
	}, []);

	const onQuestionDetectedRef = useRef(onQuestionDetected);
	const playSpeechRef = useRef<(text: string) => Promise<void>>(async () => {});

	useEffect(() => {
		onQuestionDetectedRef.current = onQuestionDetected;
	}, [onQuestionDetected]);

	const realtime = useRealtimeAI({
		fallbackToHTTP: true,
		onTranscript: (text, isPartial) => {
			if (isPartial) return;
			wsTranscriptHandlerRef.current(text);
		},
		onQuestionDetected: handleWsQuestion,
		onAnswerToken: (token) => {
			setLiveAnswerTextHttp((prev) => prev + token);
		},
		onAnswerComplete: handleWsAnswerComplete,
		onError: (msg) => onError?.(msg),
	});

	const useWsTransport = realtimeFeatureEnabled && realtime.isConnected;

	const liveAnswerText = useWsTransport && realtime.isStreaming
		? realtime.streamingAnswer || liveAnswerTextHttp
		: liveAnswerTextHttp || (realtimeFeatureEnabled ? realtime.streamingAnswer : '');

	const syncRealtimeConfig = useCallback(() => {
		realtime.updateConfig({
			model: localStorage.getItem('groq_model') || 'llama-3.1-8b-instant',
			voiceModel: localStorage.getItem('groq_voice_model') || 'whisper-large-v3-turbo',
			persona: localStorage.getItem('groq_persona') || 'Technical Interviewer',
			mode: 'voice',
			resume: localStorage.getItem('groq_resume') || '',
			jd: localStorage.getItem('groq_jd') || '',
		});
	}, [realtime]);

	const connectRealtime = useCallback(async () => {
		if (!realtimeFeatureEnabled) return false;
		syncRealtimeConfig();
		await realtime.connect();
		return realtime.status === 'connected';
	}, [realtimeFeatureEnabled, realtime, syncRealtimeConfig]);

	const disconnectRealtime = useCallback(() => {
		realtime.disconnect();
	}, [realtime]);

	const sendAudioChunk = useCallback(
		(base64: string, mimeType: string): boolean => {
			if (!useWsTransport) return false;
			return realtime.sendAudioChunk(base64, mimeType);
		},
		[useWsTransport, realtime]
	);

	const answerStyleHeader = useCallback((): Record<string, string> => {
		try {
			const style = (localStorage.getItem('groq_answer_style') || 'balanced').trim().toLowerCase();
			if (style === 'short' || style === 'balanced' || style === 'detailed') {
				return { 'x-answer-style': style };
			}
		} catch {
			// ignore localStorage access issues
		}
		return { 'x-answer-style': 'balanced' };
	}, []);

	useEffect(() => {
		audioRef.current = new Audio();

		const handleStart = () => setIsSpeaking(true);
		const handleEnd = () => setIsSpeaking(false);

		if (audioRef.current) {
			audioRef.current.addEventListener('play', handleStart);
			audioRef.current.addEventListener('ended', handleEnd);
			audioRef.current.addEventListener('pause', handleEnd);
		}

		return () => {
			if (audioRef.current) {
				audioRef.current.removeEventListener('play', handleStart);
				audioRef.current.removeEventListener('ended', handleEnd);
				audioRef.current.removeEventListener('pause', handleEnd);
				audioRef.current.pause();
				audioRef.current = null;
			}
		};
	}, []);

	const playSpeech = useCallback(async (text: string) => {
		const enableTTS = localStorage.getItem('aura_enable_tts') === 'true';
		const outputDeviceId = localStorage.getItem('aura_output_device') || '';
		const apiKey = process.env.GEMINI_API_KEY;

		if (!enableTTS || !apiKey || !text || !audioRef.current) return;

		try {
			const ai = new GoogleGenAI({ apiKey });
			const response = await ai.models.generateContent({
				model: "gemini-2.5-flash-preview-tts",
				contents: [{ parts: [{ text: buildSpeechPrompt(text) }] }],
				config: {
					responseModalities: [Modality.AUDIO],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: { voiceName: 'Kore' },
						},
					},
				},
			});

			const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
			if (base64Audio) {
				const audioBlob = await fetch(`data:audio/wav;base64,${base64Audio}`).then(res => res.blob());
				const audioUrl = URL.createObjectURL(audioBlob);

				if (audioRef.current) {
					if (outputDeviceId && (audioRef.current as any).setSinkId) {
						try {
							await (audioRef.current as any).setSinkId(outputDeviceId);
						} catch (err) {
							console.error('Error setting sink ID:', err);
						}
					}

					audioRef.current.src = audioUrl;
					await audioRef.current.play();
				}
			}
		} catch (error) {
			console.error('TTS Error:', error);
			setIsSpeaking(false);
		}
	}, []);

	useEffect(() => {
		playSpeechRef.current = playSpeech;
	}, [playSpeech]);

	const runSpeculativeClassification = useCallback((text: string) => {
		if (text.trim().length <= 20) return;
		const gen = ++speculativeGenRef.current;
		void classify(text).then((result) => {
			if (gen !== speculativeGenRef.current) return;
			lastClassificationRef.current = result;
		});
	}, [classify]);

	const processTranscriptHttp = useCallback(async (currentText: string) => {
		const classificationResult = await classify(currentText);
		lastClassificationRef.current = classificationResult;

		const CONFIDENCE_THRESHOLD = 0.7;
		if (!classificationResult.isQuestion || classificationResult.confidence < CONFIDENCE_THRESHOLD) {
			console.log(
				`[Client] Classifier filtered: isQuestion=${classificationResult.isQuestion}, ` +
				`confidence=${classificationResult.confidence.toFixed(2)}, type=${classificationResult.type}`
			);
			return;
		}

		try {
			setIsProcessing(true);
			lastProcessedTextRef.current = currentText;
			const model = localStorage.getItem('groq_model') || 'llama-3.1-8b-instant';
			const persona = localStorage.getItem('groq_persona') || 'Technical Interviewer';
			const resume = localStorage.getItem('groq_resume') || '';
			const jd = localStorage.getItem('groq_jd') || '';
			const auth = await getAuthHeaders();

			const response = await fetch(API_ENDPOINT('/api/analyze'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-model': model,
					'x-persona': persona,
					Accept: 'application/json',
					...answerStyleHeader(),
					...optionalGroqApiKeyHeaders(),
					...auth,
				},
				body: JSON.stringify({
					transcript: transcriptBufferRef.current,
					resume,
					jd,
				}),
			});

			if (response.status === 401) {
				onError?.('Sign in required.');
				setIsProcessing(false);
				return;
			}

			if (response.status === 402) {
				const errData = await response.json();
				onError?.(errData.message || 'Monthly quota exceeded. Please upgrade your plan.');
				setIsProcessing(false);
				return;
			}

			if (!response.ok) {
				const errData = await response.json();
				throw new Error(errData.error || errData.details || `Server HTTP Error: ${response.status}`);
			}

			const data = await response.json();

			if (data.isQuestion && data.confidence > 0.6 && data.question) {
				setDetectedQuestion({
					isQuestion: data.isQuestion,
					question: data.question,
					confidence: data.confidence,
					type: data.type || 'general',
				});

				if (data.bullets && data.spoken) {
					setAnswer({ bullets: data.bullets, spoken: data.spoken });
					playSpeech(data.spoken);
				}

				onQuestionDetectedRef.current?.();
				transcriptBufferRef.current = transcriptBufferRef.current.slice(-20);
			}
			setIsProcessing(false);
		} catch (error: any) {
			console.error('AI Processing Error:', error);
			setIsProcessing(false);
			onError?.(error.message || 'AI Processing failed. Check API key format.');
		}
	}, [classify, getAuthHeaders, onError, playSpeech, answerStyleHeader]);

	wsTranscriptHandlerRef.current = (text: string) => {
		transcriptBufferRef.current += ' ' + text;
		if (transcriptBufferRef.current.length > 1000) {
			transcriptBufferRef.current = transcriptBufferRef.current.slice(-1000);
		}
		onWsTranscriptRef.current?.(text);
		runSpeculativeClassification(transcriptBufferRef.current.trim());
	};

	const processTranscript = useCallback(async (newText: string) => {
		if (isSpeaking) return;

		transcriptBufferRef.current += ' ' + newText;
		if (transcriptBufferRef.current.length > 1000) {
			transcriptBufferRef.current = transcriptBufferRef.current.slice(-1000);
		}

		const currentText = transcriptBufferRef.current.trim();
		runSpeculativeClassification(currentText);

		if (useWsTransport) {
			return;
		}

		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		debounceTimerRef.current = setTimeout(async () => {
			if (!isProcessing && currentText.length > 15 && currentText !== lastProcessedTextRef.current) {
				await processTranscriptHttp(currentText);
			}
		}, 200);
	}, [isProcessing, isSpeaking, useWsTransport, runSpeculativeClassification, processTranscriptHttp]);

	const askQuestionHttp = useCallback(async (questionText: string) => {
		setIsProcessing(true);
		setLiveAnswerTextHttp('');

		const model = localStorage.getItem('groq_model') || 'llama-3.1-8b-instant';
		const persona = localStorage.getItem('groq_persona') || 'Technical Interviewer';
		const resume = localStorage.getItem('groq_resume') || '';
		const jd = localStorage.getItem('groq_jd') || '';
		const auth = await getAuthHeaders();

		const streamResponse = await fetch(API_ENDPOINT('/api/analyze/stream'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-model': model,
				'x-persona': persona,
				'x-mode': 'chat',
				Accept: 'text/event-stream',
				...answerStyleHeader(),
				...optionalGroqApiKeyHeaders(),
				...auth,
			},
			body: JSON.stringify({ transcript: questionText, resume, jd }),
		});

		if (streamResponse.status === 401) {
			onError?.('Sign in required.');
			setIsProcessing(false);
			return;
		}

		if (streamResponse.status === 402) {
			const errData = await streamResponse.json();
			onError?.(errData.message || 'Monthly quota exceeded. Please upgrade your plan.');
			setIsProcessing(false);
			return;
		}

		if (!streamResponse.ok || !streamResponse.body) {
			const fallbackResponse = await fetch(API_ENDPOINT('/api/analyze'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-model': model,
					'x-persona': persona,
					'x-mode': 'chat',
					Accept: 'application/json',
					...answerStyleHeader(),
					...optionalGroqApiKeyHeaders(),
					...auth,
				},
				body: JSON.stringify({ transcript: questionText, resume, jd }),
			});

			if (!fallbackResponse.ok) {
				const errData = await fallbackResponse.json();
				throw new Error(errData.error || errData.details || `Server HTTP Error: ${fallbackResponse.status}`);
			}

			const data = await fallbackResponse.json();
			setDetectedQuestion({
				isQuestion: true,
				question: questionText,
				confidence: 1.0,
				type: data.type || 'general',
			});
			const ans: Answer = {
				bullets: Array.isArray(data.bullets) ? data.bullets : [],
				spoken: data.spoken || '',
				explanation: data.explanation || data.answer || data.response || '',
				code: data.code || '',
				codeLanguage: data.codeLanguage || data.language || '',
				sections: data.sections || [],
			};
			setAnswer(ans);
			playSpeech(data.spoken || '');
			setLiveAnswerTextHttp('');
			setIsProcessing(false);
			return;
		}

		const reader = streamResponse.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let finalData: any = null;

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const events = buffer.split('\n\n');
			buffer = events.pop() || '';
			for (const event of events) {
				const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
				if (!dataLine) continue;
				const payload = JSON.parse(dataLine.slice(6));
				if (payload.type === 'preview' && payload.text) {
					setLiveAnswerTextHttp((prev) => prev + payload.text);
				} else if (payload.type === 'final') {
					finalData = payload.data;
				} else if (payload.type === 'error') {
					throw new Error(payload.error || 'Analyze stream failed');
				}
			}
		}

		const data = finalData;
		if (!data) throw new Error('No final streamed payload received');

		setDetectedQuestion({
			isQuestion: true,
			question: questionText,
			confidence: 1.0,
			type: data.type || 'general',
		});

		const ans: Answer = {
			bullets: Array.isArray(data.bullets) ? data.bullets : [],
			spoken: data.spoken || '',
			explanation: data.explanation || data.answer || data.response || '',
			code: data.code || '',
			codeLanguage: data.codeLanguage || data.language || '',
			sections: data.sections || [],
		};
		setAnswer(ans);
		playSpeech(data.spoken || '');
		setLiveAnswerTextHttp('');
		setIsProcessing(false);
	}, [getAuthHeaders, onError, playSpeech, answerStyleHeader]);

	const askQuestion = useCallback(async (questionText: string) => {
		if (!questionText.trim() || isProcessing) return;

		try {
			if (realtimeFeatureEnabled) {
				syncRealtimeConfig();
				if (!realtime.isConnected) {
					await realtime.connect();
				}
				if (realtime.isConnected) {
					const ok = await realtime.askQuestion(questionText);
					if (ok) return;
				}
			}

			await askQuestionHttp(questionText);
		} catch (error: any) {
			console.error('Chat AI Error:', error);
			setLiveAnswerTextHttp('');
			setIsProcessing(false);
			onError?.(error.message || 'Chat prompt failed. Check API key format.');
		}
	}, [
		isProcessing,
		realtimeFeatureEnabled,
		realtime,
		syncRealtimeConfig,
		askQuestionHttp,
		onError,
	]);

	const resetAssistant = useCallback(() => {
		setDetectedQuestion(null);
		setAnswer(null);
		setLiveAnswerTextHttp('');
		transcriptBufferRef.current = '';
		lastProcessedTextRef.current = '';
		realtime.reset();
	}, [realtime]);

	return {
		detectedQuestion,
		answer,
		liveAnswerText,
		isProcessing,
		processTranscript,
		askQuestion,
		resetAssistant,
		classifierState,
		classifierReady,
		realtimeEnabled: realtimeFeatureEnabled,
		realtimeStatus: realtime.status,
		useWsTransport,
		connectRealtime,
		disconnectRealtime,
		sendAudioChunk,
	};
}
