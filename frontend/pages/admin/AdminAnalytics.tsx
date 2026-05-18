import { useState, useEffect } from 'react';
import { BarChart3, RefreshCw, TrendingUp, Users as UsersIcon, DollarSign, Activity } from 'lucide-react';
import AdminLayout from '@frontend/components/admin/AdminLayout';
import SimpleChart, { SimplePieChart } from '@frontend/components/admin/SimpleChart';
import { useApiAuthHeaders } from '@frontend/providers/ApiAuthContext';

interface UsageAnalytics {
  userGrowth: Array<{ date: string; count: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;
  usageByPlan: Array<{ plan: string; voiceMinutes: number; chatMessages: number; sessions: number }>;
  topUsersByUsage: Array<{
    userId: string;
    email: string;
    plan: string;
    voiceMinutesUsed: number;
    chatMessagesUsed: number;
    sessionsUsed: number;
  }>;
  dailyActiveUsers: Array<{ date: string; count: number }>;
}

export default function AdminAnalytics() {
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const getAuthHeaders = useApiAuthHeaders();

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/analytics', {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You do not have admin access');
        }
        throw new Error('Failed to fetch analytics');
      }
      
      const data = await response.json();
      setAnalytics(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { 
      month: 'short', 
      year: '2-digit' 
    });
  };

  const planColors: Record<string, string> = {
    free: '#64748b',
    basic: '#3b82f6',
    pro: '#a855f7',
    enterprise: '#f59e0b',
  };

  const planBadgeColors: Record<string, string> = {
    free: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    basic: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    pro: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    enterprise: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  if (error) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-rose-400 text-lg font-medium mb-2">{error}</div>
            <button
              onClick={fetchAnalytics}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <BarChart3 className="text-purple-400" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Analytics</h1>
              <p className="text-sm text-slate-400">
                Platform usage and growth metrics
              </p>
            </div>
          </div>
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* User Growth Chart */}
          <SimpleChart
            data={(analytics?.userGrowth || []).map(d => ({
              label: formatDate(d.date),
              value: d.count,
            }))}
            type="area"
            title="New Users (Last 30 Days)"
            color="#10b981"
            height={220}
            loading={loading}
          />

          {/* Daily Active Users */}
          <SimpleChart
            data={(analytics?.dailyActiveUsers || []).map(d => ({
              label: formatDate(d.date),
              value: d.count,
            }))}
            type="line"
            title="Daily Active Users"
            color="#06b6d4"
            height={220}
            loading={loading}
          />

          {/* Revenue by Month */}
          <SimpleChart
            data={(analytics?.revenueByMonth || []).map(d => ({
              label: formatMonth(d.month),
              value: d.revenue,
            }))}
            type="bar"
            title="Monthly Revenue"
            color="#a855f7"
            height={220}
            loading={loading}
            formatValue={(v) => `$${v.toLocaleString()}`}
          />

          {/* Usage by Plan */}
          <SimplePieChart
            data={(analytics?.usageByPlan || []).map(d => ({
              label: d.plan.charAt(0).toUpperCase() + d.plan.slice(1),
              value: d.chatMessages + d.voiceMinutes + d.sessions,
              color: planColors[d.plan] || '#64748b',
            }))}
            title="Total Usage by Plan"
            loading={loading}
          />
        </div>

        {/* Top Users by Usage */}
        <div className="rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Top Users by Usage</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Plan
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Chat Messages
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Voice Minutes
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Sessions
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Total Usage
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-white/5 animate-pulse">
                      <td className="px-4 py-4">
                        <div className="h-4 w-40 bg-white/10 rounded" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-5 w-16 bg-white/10 rounded-full" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 w-12 bg-white/10 rounded ml-auto" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 w-12 bg-white/10 rounded ml-auto" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 w-12 bg-white/10 rounded ml-auto" />
                      </td>
                      <td className="px-4 py-4">
                        <div className="h-4 w-12 bg-white/10 rounded ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : analytics?.topUsersByUsage?.length ? (
                  analytics.topUsersByUsage.map((user, index) => {
                    const totalUsage = user.chatMessagesUsed + user.voiceMinutesUsed + user.sessionsUsed;
                    return (
                      <tr key={user.userId} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-[10px] font-bold text-emerald-400">
                              {index + 1}
                            </div>
                            <span className="text-sm text-white truncate max-w-[200px]">
                              {user.email}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${planBadgeColors[user.plan] || planBadgeColors.free}`}>
                            {user.plan}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm text-slate-300">
                            {user.chatMessagesUsed.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm text-slate-300">
                            {user.voiceMinutesUsed.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm text-slate-300">
                            {user.sessionsUsed.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm font-medium text-emerald-400">
                            {totalUsage.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No usage data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Usage Breakdown by Plan */}
        {!loading && analytics?.usageByPlan && analytics.usageByPlan.length > 0 && (
          <div className="mt-6 rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-white">Usage Breakdown by Plan</h2>
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {analytics.usageByPlan.map((plan) => (
                  <div 
                    key={plan.plan}
                    className="p-4 rounded-lg border transition-all hover:border-opacity-50"
                    style={{ 
                      backgroundColor: `${planColors[plan.plan]}10`,
                      borderColor: `${planColors[plan.plan]}30`,
                    }}
                  >
                    <h3 
                      className="text-sm font-bold capitalize mb-3"
                      style={{ color: planColors[plan.plan] }}
                    >
                      {plan.plan}
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Chat Messages</span>
                        <span className="text-white font-medium">
                          {plan.chatMessages.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Voice Minutes</span>
                        <span className="text-white font-medium">
                          {plan.voiceMinutes.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Sessions</span>
                        <span className="text-white font-medium">
                          {plan.sessions.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
