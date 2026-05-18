import { useEffect, useState, useCallback, useRef } from 'react';
import { API_ENDPOINT } from '../../shared/utils/config';
import { useApiAuth, useApiAuthHeaders } from '../providers/ApiAuthContext';

const clerkUiEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export interface DailyUsage {
  date: string;
  voiceMinutes: number;
  chatMessages: number;
  sessions: number;
}

export interface UsageHistoryData {
  daily: DailyUsage[];
  billingCycleStart: string;
  billingCycleEnd: string;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUsageHistory(days: number = 30): UsageHistoryData {
  const [daily, setDaily] = useState<DailyUsage[]>([]);
  const [billingCycleStart, setBillingCycleStart] = useState('');
  const [billingCycleEnd, setBillingCycleEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const getAuthHeaders = useApiAuthHeaders();
  const { isAuthReady, isSignedIn } = useApiAuth();

  const fetchUsageHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT(`/api/usage/history?days=${days}`), {
        method: 'GET',
        headers: { Accept: 'application/json', ...auth },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Usage history request failed (${response.status})`;
        throw new Error(msg);
      }

      const data = await response.json() as {
        daily?: DailyUsage[];
        billingCycleStart?: string;
        billingCycleEnd?: string;
      };

      if (!mounted.current) return;

      setDaily(data.daily ?? []);
      setBillingCycleStart(data.billingCycleStart ?? '');
      setBillingCycleEnd(data.billingCycleEnd ?? '');
    } catch (e) {
      if (!mounted.current) return;
      const message = e instanceof Error ? e.message : 'Failed to load usage history';
      setError(message);
      setDaily([]);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [getAuthHeaders, days]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (clerkUiEnabled && !isSignedIn) return;
    mounted.current = true;
    void fetchUsageHistory();
    return () => {
      mounted.current = false;
    };
  }, [fetchUsageHistory, isAuthReady, isSignedIn]);

  return {
    daily,
    billingCycleStart,
    billingCycleEnd,
    loading,
    error,
    refetch: fetchUsageHistory,
  };
}
