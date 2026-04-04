import { useState, useCallback, useRef } from 'react';
import { API_ENDPOINT } from '../../shared/utils/config';
import { optionalGroqApiKeyHeaders } from '../utils/optionalGroqApiKeyHeaders';
import { useApiAuthHeaders } from '../providers/ApiAuthContext';

function clampChunkMs(raw: number): number {
	if (!Number.isFinite(raw)) return 5000;
	return Math.min(Math.max(Math.round(raw), 2000), 15000);
}

/** Read from localStorage on each chunk so changes apply after Save without reload. */
function getVoiceChunkMs(): number {
	const v = parseInt(localStorage.getItem('voice_chunk_ms') || '5000', 10);
	return clampChunkMs(v);
}

function shouldSkipSilentChunks(): boolean {
	return localStorage.getItem('voice_skip_silent') !== 'false';
}

export function useTabAudioCapture(onTranscriptUpdate: (text: string) => void, onError?: (msg: string) => void) {
	const getAuthHeaders = useApiAuthHeaders();
	const [isListening, setIsListening] = useState(false);
	const [isRateLimited, setIsRateLimited] = useState(false);
	const [transcript, setTranscript] = useState('');
	const streamRef = useRef<MediaStream | null>(null);
	const isRecordingRef = useRef(false);
	const autoClearTimerRef = useRef<NodeJS.Timeout | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);

	const clearTranscript = useCallback(() => {
		setTranscript('');
		if (autoClearTimerRef.current) {
			clearTimeout(autoClearTimerRef.current);
		}
	}, []);

	const stopListening = useCallback(() => {
		isRecordingRef.current = false;
		setIsListening(false);
		if (streamRef.current) {
			streamRef.current.getTracks().forEach(t => t.stop());
			streamRef.current = null;
		}
		const ctx = audioContextRef.current;
		if (ctx) {
			audioContextRef.current = null;
			void ctx.close();
		}
	}, []);

	const startListening = useCallback(async () => {
		try {
			const isElectron = /electron/i.test(navigator.userAgent);
			let stream: MediaStream;

			if (isElectron) {
				const ipcRenderer = (window as any).require ? (window as any).require('electron').ipcRenderer : null;
				if (!ipcRenderer) throw new Error("Electron IPC not available.");

				const sourceId = await ipcRenderer.invoke('get-source-id');
				if (!sourceId) throw new Error("Failed to detect primary monitor.");

				stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						mandatory: {
							chromeMediaSource: 'desktop',
						}
					} as any,
					video: {
						mandatory: {
							chromeMediaSource: 'desktop',
							chromeMediaSourceId: sourceId
						}
					} as any
				});
			} else {
				stream = await navigator.mediaDevices.getDisplayMedia({
					video: { displaySurface: 'browser' } as any,
					audio: true,
				});
			}

			const audioTracks = stream.getAudioTracks();
			if (audioTracks.length === 0) {
				const isElectron = /electron/i.test(navigator.userAgent);
				if (onError) onError(isElectron
					? 'System Audio Loopback failed. Ensure audio is playing and try again.'
					: 'No audio track detected! Check "Also share tab audio" in the browser popup.');
				stream.getTracks().forEach(t => t.stop());
				return;
			}

			const audioStream = new MediaStream([audioTracks[0]]);
			streamRef.current = stream;
			isRecordingRef.current = true;
			setIsListening(true);
			clearTranscript();

			const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!AudioCtx) throw new Error('Web Audio API not supported.');
			const audioContext = new AudioCtx();
			audioContextRef.current = audioContext;
			if (audioContext.state === 'suspended') {
				await audioContext.resume();
			}
			const mediaSource = audioContext.createMediaStreamSource(audioStream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 512;
			analyser.smoothingTimeConstant = 0.45;
			mediaSource.connect(analyser);

			const recordNextChunk = () => {
				if (!isRecordingRef.current || !streamRef.current) return;

				let options: MediaRecorderOptions = {};
				if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
					options = { mimeType: 'audio/webm;codecs=opus' };
				} else if (MediaRecorder.isTypeSupported('audio/webm')) {
					options = { mimeType: 'audio/webm' };
				} else if (MediaRecorder.isTypeSupported('audio/mp4')) {
					options = { mimeType: 'audio/mp4' };
				}

				const recorder = new MediaRecorder(audioStream, options);
				const chunkMs = getVoiceChunkMs();
				let chunkHadSpeech = false;
				const rmsThreshold = 0.028;

				const monitor = window.setInterval(() => {
					const buf = new Uint8Array(analyser.fftSize);
					analyser.getByteTimeDomainData(buf);
					let sum = 0;
					for (let i = 0; i < buf.length; i++) {
						const x = (buf[i] - 128) / 128;
						sum += x * x;
					}
					const rms = Math.sqrt(sum / buf.length);
					if (rms > rmsThreshold) chunkHadSpeech = true;
				}, 64);

				recorder.ondataavailable = async (e) => {
					if (e.data.size > 0 && isRecordingRef.current) {
						if (shouldSkipSilentChunks() && !chunkHadSpeech) {
							return;
						}
						const reader = new FileReader();
						reader.readAsDataURL(e.data);
						reader.onloadend = async () => {
							const base64data = (reader.result as string).split(',')[1];
							const mimeType = recorder.mimeType || 'audio/webm';

							try {
								const voiceModel = localStorage.getItem('groq_voice_model') || 'whisper-large-v3-turbo';
								const auth = await getAuthHeaders();

								const response = await fetch(API_ENDPOINT('/api/transcribe'), {
									method: 'POST',
									headers: {
										'Content-Type': 'application/json',
										'x-voice-model': voiceModel,
										Accept: 'application/json',
										...optionalGroqApiKeyHeaders(),
										...auth,
									},
									body: JSON.stringify({
										audioBase64: base64data,
										mimeType,
										audioChunkDuration: chunkMs / 1000,
									}),
								});

								if (response.status === 401) {
									if (onError) onError('Sign in required to use voice transcription.');
									setIsListening(false);
									return;
								}

								if (response.status === 429) {
									setIsRateLimited(true);
									const data = await response.json();
									setTimeout(() => setIsRateLimited(false), (data.retryAfter || 3) * 1000);
									return;
								}

								if (response.status === 402) {
									const data = await response.json();
									if (onError) onError(data.message || 'Voice quota exceeded');
									setIsListening(false);
									return;
								}

								if (!response.ok) {
									const errData = await response.json();
									throw new Error(errData.error || errData.details || `Server HTTP Error: ${response.status}`);
								}

								setIsRateLimited(false);
								const data = await response.json();
								const text = data.text?.trim();

								if (text && text.length > 2) {
									setTranscript(prev => {
										const newTranscript = prev + (prev ? ' ' : '') + text;
										return newTranscript.length > 2000 ? newTranscript.slice(-2000) : newTranscript;
									});
									onTranscriptUpdate(text);
								}
							} catch (error: any) {
								console.error('STT Error:', error);
								if (onError) onError(error.message || 'Speech-to-text failed.');
							}
						};
					}
				};

				recorder.start();

				setTimeout(() => {
					window.clearInterval(monitor);
					if (recorder.state === 'recording') {
						recorder.stop();
						if (isRecordingRef.current) {
							recordNextChunk();
						}
					}
				}, chunkMs);
			};

			recordNextChunk();

			const videoTrack = stream.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.onended = () => {
					stopListening();
				};
			}

		} catch (err: any) {
			console.error('Error capturing tab audio:', err);
			stopListening();
			if (onError) onError(`Audio capture failed: ${err.message || err.name || 'Unknown error'}`);
		}
	}, [onTranscriptUpdate, stopListening, clearTranscript, onError, getAuthHeaders]);

	return { isListening, isRateLimited, transcript, startListening, stopListening, clearTranscript, stream: streamRef.current };
}