import { useEffect, useState, useCallback, useRef } from 'react';
import { API_ENDPOINT } from '../../shared/utils/config';
import { useApiAuth, useApiAuthHeaders } from '../providers/ApiAuthContext';
import { Session } from '../components/dashboard/RecentSessionsList';

const clerkUiEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export interface DashboardStats {
  totalVoiceMinutes: number;
  totalChatMessages: number;
  totalSessions: number;
  averageSessionDuration: number;
  currentStreak: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recentSessions: Session[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const defaultStats: DashboardStats = {
  totalVoiceMinutes: 0,
  totalChatMessages: 0,
  totalSessions: 0,
  averageSessionDuration: 0,
  currentStreak: 0,
};

export function useDashboard(): DashboardData {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const getAuthHeaders = useApiAuthHeaders();
  const { isAuthReady, isSignedIn } = useApiAuth();

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT('/api/dashboard'), {
        method: 'GET',
        headers: { Accept: 'application/json', ...auth },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Dashboard request failed (${response.status})`;
        throw new Error(msg);
      }

      const data = await response.json() as {
        stats?: DashboardStats;
        recentSessions?: Session[];
      };

      if (!mounted.current) return;

      setStats(data.stats ?? defaultStats);
      setRecentSessions(data.recentSessions ?? []);
    } catch (e) {
      if (!mounted.current) return;
      const message = e instanceof Error ? e.message : 'Failed to load dashboard';
      setError(message);
      setStats(defaultStats);
      setRecentSessions([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (clerkUiEnabled && !isSignedIn) return;
    mounted.current = true;
    void fetchDashboard();
    return () => {
      mounted.current = false;
    };
  }, [fetchDashboard, isAuthReady, isSignedIn]);

  return {
    stats,
    recentSessions,
    loading,
    error,
    refetch: fetchDashboard,
  };
}
