import { useEffect, useState, useCallback, useRef } from 'react';
import { PlanTier } from '../../shared/constants/planLimits';
import { API_ENDPOINT } from '../../shared/utils/config';
import { useApiAuthHeaders } from '../providers/ApiAuthContext';

export interface UsageQuota {
	voiceMinutes: { used: number; limit: number; remaining: number; percentUsed: number };
	chatMessages: { used: number; limit: number; remaining: number; percentUsed: number };
	sessions: { used: number; limit: number; remaining: number; percentUsed: number };
}

export interface PlanStatus {
	plan: PlanTier;
	quotas: UsageQuota;
	trialDaysRemaining: number;
	features: Record<string, boolean>;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

function isPlanTier(v: string): v is PlanTier {
	return v === 'free' || v === 'basic' || v === 'pro' || v === 'enterprise';
}

const emptyQuotas: UsageQuota = {
	voiceMinutes: { used: 0, limit: 0, remaining: 0, percentUsed: 0 },
	chatMessages: { used: 0, limit: 0, remaining: 0, percentUsed: 0 },
	sessions: { used: 0, limit: 0, remaining: 0, percentUsed: 0 },
};

export function usePlanStatus(): PlanStatus {
	const [plan, setPlan] = useState<PlanTier>('free');
	const [quotas, setQuotas] = useState<UsageQuota>(emptyQuotas);
	const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
	const [features, setFeatures] = useState<Record<string, boolean>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const mounted = useRef(true);
	const getAuthHeaders = useApiAuthHeaders();

	const fetchPlanStatus = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const auth = await getAuthHeaders();
			const response = await fetch(API_ENDPOINT('/api/usage'), {
				method: 'GET',
				headers: { Accept: 'application/json', ...auth },
			});

			if (!response.ok) {
				const errBody = await response.json().catch(() => ({}));
				const msg =
					(errBody as { error?: string }).error ||
					`Usage request failed (${response.status})`;
				throw new Error(msg);
			}

			const data = (await response.json()) as {
				user?: { plan?: string };
				quotas?: UsageQuota;
				features?: Record<string, boolean>;
				trialDaysRemaining?: number;
			};

			if (!mounted.current) return;

			const nextPlan = data.user?.plan && isPlanTier(data.user.plan) ? data.user.plan : 'free';
			setPlan(nextPlan);
			setQuotas(
				data.quotas ?? {
					voiceMinutes: { used: 0, limit: 0, remaining: 0, percentUsed: 0 },
					chatMessages: { used: 0, limit: 0, remaining: 0, percentUsed: 0 },
					sessions: { used: 0, limit: 0, remaining: 0, percentUsed: 0 },
				}
			);
			setFeatures(data.features ?? {});
			setTrialDaysRemaining(typeof data.trialDaysRemaining === 'number' ? data.trialDaysRemaining : 0);
		} catch (e) {
			if (!mounted.current) return;
			const message = e instanceof Error ? e.message : 'Failed to load usage';
			setError(message);
			setQuotas(emptyQuotas);
		} finally {
			if (mounted.current) setLoading(false);
		}
	}, [getAuthHeaders]);

	useEffect(() => {
		mounted.current = true;
		void fetchPlanStatus();
		return () => {
			mounted.current = false;
		};
	}, [fetchPlanStatus]);

	return {
		plan,
		quotas,
		trialDaysRemaining,
		features,
		loading,
		error,
		refetch: fetchPlanStatus,
	};
}
