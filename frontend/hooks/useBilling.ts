import { useEffect, useState, useCallback, useRef } from 'react';
import { API_ENDPOINT } from '../../shared/utils/config';
import { useApiAuth, useApiAuthHeaders } from '../providers/ApiAuthContext';
import { PlanTier } from '../../shared/constants/planLimits';
import { Invoice } from '../components/dashboard/InvoiceTable';

const clerkUiEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'bank';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface BillingData {
  currentPlan: PlanTier;
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | 'trialing' | 'none';
  nextBillingDate: string | null;
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  changePlan: (plan: PlanTier) => Promise<void>;
  cancelSubscription: () => Promise<void>;
}

export function useBilling(): BillingData {
  const [currentPlan, setCurrentPlan] = useState<PlanTier>('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState<BillingData['subscriptionStatus']>('none');
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const getAuthHeaders = useApiAuthHeaders();
  const { isAuthReady, isSignedIn } = useApiAuth();

  const fetchBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT('/api/billing'), {
        method: 'GET',
        headers: { Accept: 'application/json', ...auth },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Billing request failed (${response.status})`;
        throw new Error(msg);
      }

      const data = await response.json() as {
        currentPlan?: PlanTier;
        subscriptionStatus?: BillingData['subscriptionStatus'];
        nextBillingDate?: string;
        paymentMethods?: PaymentMethod[];
        invoices?: Invoice[];
      };

      if (!mounted.current) return;

      setCurrentPlan(data.currentPlan ?? 'free');
      setSubscriptionStatus(data.subscriptionStatus ?? 'none');
      setNextBillingDate(data.nextBillingDate ?? null);
      setPaymentMethods(data.paymentMethods ?? []);
      setInvoices(data.invoices ?? []);
    } catch (e) {
      if (!mounted.current) return;
      const message = e instanceof Error ? e.message : 'Failed to load billing';
      setError(message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [getAuthHeaders]);

  const changePlan = useCallback(async (plan: PlanTier) => {
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT('/api/billing/change-plan'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Accept: 'application/json', 
          ...auth 
        },
        body: JSON.stringify({ plan }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Plan change failed (${response.status})`;
        throw new Error(msg);
      }

      await fetchBilling();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to change plan';
      throw new Error(message);
    }
  }, [getAuthHeaders, fetchBilling]);

  const cancelSubscription = useCallback(async () => {
    try {
      const auth = await getAuthHeaders();
      const response = await fetch(API_ENDPOINT('/api/billing/cancel'), {
        method: 'POST',
        headers: { Accept: 'application/json', ...auth },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: string }).error || `Cancel failed (${response.status})`;
        throw new Error(msg);
      }

      await fetchBilling();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to cancel subscription';
      throw new Error(message);
    }
  }, [getAuthHeaders, fetchBilling]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (clerkUiEnabled && !isSignedIn) return;
    mounted.current = true;
    void fetchBilling();
    return () => {
      mounted.current = false;
    };
  }, [fetchBilling, isAuthReady, isSignedIn]);

  return {
    currentPlan,
    subscriptionStatus,
    nextBillingDate,
    paymentMethods,
    invoices,
    loading,
    error,
    refetch: fetchBilling,
    changePlan,
    cancelSubscription,
  };
}
