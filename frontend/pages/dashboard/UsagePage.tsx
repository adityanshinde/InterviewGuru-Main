import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { UsageProgressCard } from '../../components/dashboard/UsageProgressCard';
import { UsageChart } from '../../components/dashboard/UsageChart';
import { usePlanStatus } from '../../hooks/usePlanStatus';
import { useUsageHistory } from '../../hooks/useUsageHistory';
import { PLAN_LIMITS } from '../../../shared/constants/planLimits';

export function UsagePage() {
  const { quotas, plan, trialDaysRemaining, loading: planLoading, error: planError } = usePlanStatus();
  const { daily, billingCycleStart, billingCycleEnd, loading: historyLoading, error: historyError } = useUsageHistory(30);

  const loading = planLoading || historyLoading;
  const error = planError || historyError;
  const planConfig = PLAN_LIMITS[plan];

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const totalVoiceThisMonth = daily.reduce((sum, d) => sum + d.voiceMinutes, 0);
  const totalChatThisMonth = daily.reduce((sum, d) => sum + d.chatMessages, 0);
  const totalSessionsThisMonth = daily.reduce((sum, d) => sum + d.sessions, 0);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Usage</h1>
        <p className="mt-2 text-slate-400">
          Track your usage across voice, chat, and sessions.
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-rose-300">{error}</p>
        </div>
      )}

      {/* Current Billing Cycle */}
      <div className="mb-8 bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Current Billing Cycle</h2>
            <p className="text-sm text-slate-400 mt-1">
              {formatDate(billingCycleStart)} - {formatDate(billingCycleEnd)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-slate-400">Current Plan</p>
              <p className="text-lg font-semibold text-white capitalize">{planConfig.name}</p>
            </div>
            {plan !== 'enterprise' && (
              <Link
                to="/app/billing"
                className="px-4 py-2 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-400 transition-colors"
              >
                Upgrade
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Usage Progress Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <UsageProgressCard
          title="Voice Minutes"
          used={quotas.voiceMinutes.used}
          limit={quotas.voiceMinutes.limit}
          unit=" min"
          color="emerald"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          }
        />
        <UsageProgressCard
          title="Chat Messages"
          used={quotas.chatMessages.used}
          limit={quotas.chatMessages.limit}
          color="cyan"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          }
        />
        <UsageProgressCard
          title="Sessions"
          used={quotas.sessions.used}
          limit={quotas.sessions.limit}
          color="violet"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Usage Alerts */}
      {(quotas.voiceMinutes.percentUsed >= 80 || quotas.chatMessages.percentUsed >= 80 || quotas.sessions.percentUsed >= 80) && (
        <div className="mb-8 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-amber-200">Usage Alert</h3>
              <p className="text-sm text-amber-300/70 mt-1">
                You're approaching your usage limits for this billing cycle.
                {plan !== 'enterprise' && (
                  <> Consider <Link to="/app/billing" className="underline hover:text-amber-200">upgrading your plan</Link> for more resources.</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trial Warning */}
      {plan === 'free' && trialDaysRemaining > 0 && trialDaysRemaining <= 3 && (
        <div className="mb-8 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-rose-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-rose-200">Trial Ending Soon</h3>
              <p className="text-sm text-rose-300/70 mt-1">
                Your free trial ends in {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''}.
                <Link to="/app/billing" className="underline hover:text-rose-200 ml-1">Upgrade now</Link> to continue using InterviewGuru.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Usage Chart */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-white mb-4">Last 30 Days</h2>
        <UsageChart data={daily} loading={loading} />
      </div>

      {/* Usage Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-white">{totalVoiceThisMonth}</p>
          <p className="text-sm text-slate-400 mt-1">Voice Minutes</p>
          <p className="text-xs text-slate-500 mt-2">This month</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-white">{totalChatThisMonth}</p>
          <p className="text-sm text-slate-400 mt-1">Chat Messages</p>
          <p className="text-xs text-slate-500 mt-2">This month</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-white">{totalSessionsThisMonth}</p>
          <p className="text-sm text-slate-400 mt-1">Sessions</p>
          <p className="text-xs text-slate-500 mt-2">This month</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
