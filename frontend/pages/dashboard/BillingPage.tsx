import { useState } from 'react';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { PlanCard } from '../../components/dashboard/PlanCard';
import { InvoiceTable } from '../../components/dashboard/InvoiceTable';
import { useBilling } from '../../hooks/useBilling';
import { PlanTier, PLAN_LIMITS } from '../../../shared/constants/planLimits';

export function BillingPage() {
  const { 
    currentPlan, 
    subscriptionStatus, 
    nextBillingDate, 
    paymentMethods, 
    invoices, 
    loading, 
    error,
    changePlan,
    cancelSubscription,
  } = useBilling();

  const [changingPlan, setChangingPlan] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleChangePlan = async (plan: PlanTier) => {
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@interviewguru.ai?subject=Enterprise%20Plan%20Inquiry';
      return;
    }
    
    setChangingPlan(true);
    setActionError(null);
    try {
      await changePlan(plan);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to change plan');
    } finally {
      setChangingPlan(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancellingSubscription(true);
    setActionError(null);
    try {
      await cancelSubscription();
      setShowCancelConfirm(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to cancel subscription');
    } finally {
      setCancellingSubscription(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    canceled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    past_due: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    trialing: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    none: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };

  const defaultPaymentMethod = paymentMethods.find(pm => pm.isDefault);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Billing</h1>
        <p className="mt-2 text-slate-400">
          Manage your subscription, payment methods, and invoices.
        </p>
      </div>

      {/* Error States */}
      {(error || actionError) && (
        <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-rose-300">{error || actionError}</p>
        </div>
      )}

      {/* Current Subscription */}
      <div className="mb-8 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Current Subscription</h2>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-2xl font-bold text-white capitalize">{PLAN_LIMITS[currentPlan].name}</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${statusColors[subscriptionStatus]}`}>
                {subscriptionStatus === 'none' ? 'No subscription' : subscriptionStatus.replace('_', ' ')}
              </span>
            </div>
            {nextBillingDate && subscriptionStatus === 'active' && (
              <p className="text-sm text-slate-400 mt-2">
                Next billing date: {formatDate(nextBillingDate)}
              </p>
            )}
          </div>
          
          {subscriptionStatus === 'active' && currentPlan !== 'free' && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-4 py-2 text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-500/50 rounded-lg transition-colors"
            >
              Cancel Subscription
            </button>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-2">Cancel Subscription?</h3>
            <p className="text-slate-400 mb-6">
              Are you sure you want to cancel your subscription? You'll lose access to premium features at the end of your current billing period.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancellingSubscription}
                className="px-4 py-2 bg-rose-500 text-white font-medium rounded-lg hover:bg-rose-400 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {cancellingSubscription && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Method */}
      <div className="mb-8 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Payment Method</h2>
          <button className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
            + Add Payment Method
          </button>
        </div>
        
        {loading ? (
          <div className="animate-pulse bg-slate-800/50 rounded-lg h-20" />
        ) : defaultPaymentMethod ? (
          <div className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg">
            <div className="w-12 h-8 bg-slate-700 rounded flex items-center justify-center">
              {defaultPaymentMethod.brand === 'visa' ? (
                <span className="text-xs font-bold text-blue-400">VISA</span>
              ) : defaultPaymentMethod.brand === 'mastercard' ? (
                <span className="text-xs font-bold text-orange-400">MC</span>
              ) : (
                <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              )}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">
                {defaultPaymentMethod.brand ? `${defaultPaymentMethod.brand.charAt(0).toUpperCase()}${defaultPaymentMethod.brand.slice(1)}` : 'Card'} •••• {defaultPaymentMethod.last4}
              </p>
              <p className="text-sm text-slate-400">
                Expires {defaultPaymentMethod.expiryMonth}/{defaultPaymentMethod.expiryYear}
              </p>
            </div>
            <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">Default</span>
          </div>
        ) : (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-slate-400">No payment method on file</p>
            <button className="mt-3 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
              Add Payment Method
            </button>
          </div>
        )}
      </div>

      {/* Plans */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-white mb-6">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(['free', 'basic', 'pro', 'enterprise'] as PlanTier[]).map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              isCurrentPlan={plan === currentPlan}
              recommended={plan === 'pro'}
              onSelect={plan !== currentPlan && !changingPlan ? () => handleChangePlan(plan) : undefined}
            />
          ))}
        </div>
        {changingPlan && (
          <div className="mt-4 flex items-center justify-center gap-2 text-emerald-400">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <span>Updating your plan...</span>
          </div>
        )}
      </div>

      {/* Invoice History */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Invoice History</h2>
        <InvoiceTable invoices={invoices} loading={loading} />
      </div>
    </DashboardLayout>
  );
}
