import { Link } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { StatsCard } from '../../components/dashboard/StatsCard';
import { UsageProgressCard } from '../../components/dashboard/UsageProgressCard';
import { RecentSessionsList } from '../../components/dashboard/RecentSessionsList';
import { useDashboard } from '../../hooks/useDashboard';
import { usePlanStatus } from '../../hooks/usePlanStatus';

export function DashboardHome() {
  const { user } = useUser();
  const { stats, recentSessions, loading: dashboardLoading, error: dashboardError } = useDashboard();
  const { quotas, plan, trialDaysRemaining, loading: planLoading } = usePlanStatus();

  const firstName = user?.firstName || user?.username || 'there';
  const loading = dashboardLoading || planLoading;

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {firstName}!
        </h1>
        <p className="mt-2 text-slate-400">
          Here's an overview of your interview practice progress.
        </p>
      </div>

      {/* Trial/Plan Banner */}
      {plan === 'free' && trialDaysRemaining > 0 && (
        <div className="mb-6 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-amber-200">Free Trial Active</p>
                <p className="text-sm text-amber-300/70">
                  {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} remaining
                </p>
              </div>
            </div>
            <Link
              to="/app/billing"
              className="px-4 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-400 transition-colors"
            >
              Upgrade Now
            </Link>
          </div>
        </div>
      )}

      {/* Error State */}
      {dashboardError && (
        <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-rose-300">{dashboardError}</p>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total Sessions"
          value={loading ? '...' : stats.totalSessions.toString()}
          subtitle="All time"
          color="emerald"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatsCard
          title="Voice Minutes"
          value={loading ? '...' : `${stats.totalVoiceMinutes}m`}
          subtitle="This month"
          color="cyan"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          }
        />
        <StatsCard
          title="Chat Messages"
          value={loading ? '...' : stats.totalChatMessages.toString()}
          subtitle="This month"
          color="violet"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          }
        />
        <StatsCard
          title="Avg. Duration"
          value={loading ? '...' : `${Math.round(stats.averageSessionDuration / 60)}m`}
          subtitle="Per session"
          color="amber"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Usage Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Usage This Month</h2>
          <Link 
            to="/app/usage" 
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            View details →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* Quick Actions & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/app"
              className="flex items-center gap-4 p-4 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-xl hover:border-emerald-500/40 transition-all group"
            >
              <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white">Start Voice Session</p>
                <p className="text-sm text-slate-400">Practice with AI interviewer</p>
              </div>
            </Link>
            <Link
              to="/app"
              className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-all group"
            >
              <div className="w-12 h-12 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white">Start Chat Session</p>
                <p className="text-sm text-slate-400">Text-based interview prep</p>
              </div>
            </Link>
            {plan !== 'pro' && plan !== 'enterprise' && (
              <Link
                to="/app/billing"
                className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-slate-700 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-white">Upgrade Plan</p>
                  <p className="text-sm text-slate-400">Get more features & limits</p>
                </div>
              </Link>
            )}
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Recent Sessions</h2>
            <Link 
              to="/app/sessions" 
              className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              View all →
            </Link>
          </div>
          <RecentSessionsList sessions={recentSessions.slice(0, 5)} loading={loading} />
        </div>
      </div>
    </DashboardLayout>
  );
}
