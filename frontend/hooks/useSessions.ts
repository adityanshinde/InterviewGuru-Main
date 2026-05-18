import { useEffect, useState, useCallback, useRef } from 'react';
import { API_ENDPOINT } from '../../shared/utils/config';
import { useApiAuth, useApiAuthHeaders } from '../providers/ApiAuthContext';
import { Session } from '../components/dashboard/RecentSessionsList';

const clerkUiEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export interface SessionsData {
  sessions: Session[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string) => Promise<Blob | null>;
}

export function useSessions(): SessionsData {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const getAuthHeaders = useApiAuthHeaders();
  const { isAuthReady, isSignedIn } = useApiAuth();

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT('/api/sessions'), {
        method: 'GET',
        headers: { Accept: 'application/json', ...auth },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Sessions request failed (${response.status})`;
        throw new Error(msg);
      }

      const data = await response.json() as {
        sessions?: Session[];
        total?: number;
      };

      if (!mounted.current) return;

      setSessions(data.sessions ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      if (!mounted.current) return;
      const message = e instanceof Error ? e.message : 'Failed to load sessions';
      setError(message);
      setSessions([]);
      setTotal(0);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [getAuthHeaders]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT(`/api/sessions/${sessionId}`), {
        method: 'DELETE',
        headers: { Accept: 'application/json', ...auth },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Delete failed (${response.status})`;
        throw new Error(msg);
      }

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to delete session';
      throw new Error(message);
    }
  }, [getAuthHeaders]);

  const exportSession = useCallback(async (sessionId: string): Promise<Blob | null> => {
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT(`/api/sessions/${sessionId}/export`), {
        method: 'GET',
        headers: { ...auth },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Export failed (${response.status})`;
        throw new Error(msg);
      }

      return await response.blob();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to export session';
      throw new Error(message);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (clerkUiEnabled && !isSignedIn) return;
    mounted.current = true;
    void fetchSessions();
    return () => {
      mounted.current = false;
    };
  }, [fetchSessions, isAuthReady, isSignedIn]);

  return {
    sessions,
    total,
    loading,
    error,
    refetch: fetchSessions,
    deleteSession,
    exportSession,
  };
}
