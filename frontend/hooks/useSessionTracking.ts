import { useState, useCallback, useRef } from 'react';
import { API_ENDPOINT } from '../../shared/utils/config';
import { useApiAuthHeaders } from '../providers/ApiAuthContext';

export interface SessionQuestion {
	question: string;
	answer: string[];
	confidence?: number;
	type?: string;
	difficulty?: string;
	timestamp: number;
}

export function useSessionTracking() {
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isSessionActive, setIsSessionActive] = useState(false);
	const [sessionLimitMinutes, setSessionLimitMinutes] = useState<number | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const questionsBuffer = useRef<SessionQuestion[]>([]);
	const getAuthHeaders = useApiAuthHeaders();

	const startSession = useCallback(
		async (metadata?: { persona?: string; resume?: string; jd?: string }) => {
			const auth = await getAuthHeaders();
			try {
				const res = await fetch(API_ENDPOINT('/api/sessions/start'), {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
						...auth,
					},
					body: JSON.stringify(metadata || {}),
				});

				if (res.status === 402) {
					const data = await res.json().catch(() => ({}));
					console.warn('[Session] Quota:', data.message || 'Session limit reached');
					return null;
				}

				if (!res.ok) {
					const err = await res.json().catch(() => ({}));
					console.error('[Session] Start failed:', err.error || res.status);
					return null;
				}

				const data = (await res.json()) as { sessionId?: string; durationLimitMinutes?: number };
				const sid = data.sessionId || null;
				if (sid) {
					setSessionId(sid);
					setIsSessionActive(true);
					setSessionLimitMinutes(
						typeof data.durationLimitMinutes === 'number' ? data.durationLimitMinutes : null
					);
					setSessionError(null);
					questionsBuffer.current = [];
					console.log(`[Session] Started: ${sid}`);
				}
				return sid;
			} catch (e) {
				console.error('[Session] Start error:', e);
				return null;
			}
		},
		[getAuthHeaders]
	);

	const updateSession = useCallback(
		async (question: SessionQuestion) => {
			if (!sessionId) {
				console.warn('[Session] No active session to update');
				return;
			}
			questionsBuffer.current.push(question);
			const auth = await getAuthHeaders();
			try {
				const res = await fetch(API_ENDPOINT(`/api/sessions/${encodeURIComponent(sessionId)}`), {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
						...auth,
					},
					body: JSON.stringify({
						questionsAsked: questionsBuffer.current.length,
						voiceMinutesUsed: 0,
					}),
				});
				if (res.status === 402) {
					const data = await res.json().catch(() => ({}));
					const msg =
						(data as { error?: string }).error || 'Session reached the duration limit. Start a new session.';
					console.warn('[Session] Duration limit reached:', msg);
					setSessionId(null);
					setIsSessionActive(false);
					setSessionLimitMinutes(null);
					setSessionError(msg);
					questionsBuffer.current = [];
				}
			} catch (e) {
				console.warn('[Session] Update failed (offline?):', e);
			}
		},
		[sessionId, getAuthHeaders]
	);

	const closeSession = useCallback(async () => {
		if (!sessionId) {
			console.warn('[Session] No active session to close');
			return;
		}
		const sid = sessionId;
		const auth = await getAuthHeaders();
		try {
			await fetch(API_ENDPOINT(`/api/sessions/${encodeURIComponent(sid)}/close`), {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					...auth,
				},
				body: JSON.stringify({ status: 'completed' }),
			});
		} catch (e) {
			console.warn('[Session] Close failed:', e);
		}

		console.log(`[Session] Closed ${sid} with ${questionsBuffer.current.length} questions`);
		setSessionId(null);
		setIsSessionActive(false);
		setSessionLimitMinutes(null);
		setSessionError(null);
		questionsBuffer.current = [];
	}, [sessionId, getAuthHeaders]);

	return {
		sessionId,
		isSessionActive,
		sessionLimitMinutes,
		sessionError,
		startSession,
		updateSession,
		closeSession,
	};
}
