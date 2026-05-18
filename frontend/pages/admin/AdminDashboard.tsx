import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  Activity,
  ArrowRight,
  Loader2,
  RefreshCw
} from 'lucide-react';
import AdminLayout from '@frontend/components/admin/AdminLayout';
import StatsCard from '@frontend/components/admin/StatsCard';
import { useApiAuthHeaders } from '@frontend/providers/ApiAuthContext';

interface PlatformStats {
  totalUsers: number;
  activeSubscriptions: number;
  revenueThisMonth: number;
  usageThisMonth: {
    voiceMinutes: number;
    chatMessages: number;
    sessions: number;
  };
  recentSignups: Array<{
    userId: string;
    email: string;
    plan: string;
    createdAt: string;
  }>;
  planDistribution: Record<string, number>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const getAuthHeaders = useApiAuthHeaders();

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/stats', {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('You do not have admin access');
        }
        throw new Error('Failed to fetch statistics');
      }
      
      const data = await response.json();
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const planColors: Record<string, string> = {
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
              onClick={fetchStats}
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
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1">
              Welcome to the InterviewGuru admin panel
            </p>
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatsCard
            title="Total Users"
            value={stats?.totalUsers || 0}
            icon={<Users size={20} />}
            colorClass="emerald"
            loading={loading}
          />
          <StatsCard
            title="Active Subscriptions"
            value={stats?.activeSubscriptions || 0}
            icon={<CreditCard size={20} />}
            colorClass="blue"
            loading={loading}
          />
          <StatsCard
            title="Revenue This Month"
            value={formatCurrency(stats?.revenueThisMonth || 0)}
            icon={<TrendingUp size={20} />}
            colorClass="purple"
            loading={loading}
          />
          <StatsCard
            title="Usage This Month"
            value={`${(stats?.usageThisMonth?.chatMessages || 0).toLocaleString()} msgs`}
            icon={<Activity size={20} />}
            colorClass="amber"
            loading={loading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Signups */}
          <div className="rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white">Recent Signups</h2>
              <Link 
                to="/admin/users" 
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                View All
                <ArrowRight size={12} />
              </Link>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-8 h-8 rounded-full bg-white/10" />
                      <div className="flex-1">
                        <div className="h-3 w-32 bg-white/10 rounded mb-1" />
                        <div className="h-2 w-20 bg-white/5 rounded" />
                      </div>
                      <div className="h-5 w-12 bg-white/10 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : stats?.recentSignups?.length ? (
                <div className="space-y-3">
                  {stats.recentSignups.slice(0, 5).map((user) => (
                    <div key={user.userId} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400">
                        {user.email[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{user.email}</p>
                        <p className="text-[10px] text-slate-500">{formatDate(user.createdAt)}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${planColors[user.plan] || planColors.free}`}>
                        {user.plan}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500 text-sm py-8">No recent signups</p>
              )}
            </div>
          </div>

          {/* Plan Distribution */}
          <div className="rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white">Plan Distribution</h2>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="flex items-center justify-between mb-2">
                        <div className="h-3 w-20 bg-white/10 rounded" />
                        <div className="h-3 w-10 bg-white/10 rounded" />
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : stats?.planDistribution ? (
                <div className="space-y-4">
                  {Object.entries(stats.planDistribution).map(([plan, count]) => {
                    const total = Object.values(stats.planDistribution).reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    const colors: Record<string, { bar: string; text: string }> = {
                      free: { bar: 'bg-slate-500', text: 'text-slate-400' },
                      basic: { bar: 'bg-blue-500', text: 'text-blue-400' },
                      pro: { bar: 'bg-purple-500', text: 'text-purple-400' },
                      enterprise: { bar: 'bg-amber-500', text: 'text-amber-400' },
                    };
                    const color = colors[plan] || colors.free;

                    return (
                      <div key={plan}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-sm font-medium capitalize ${color.text}`}>
                            {plan}
                          </span>
                          <span className="text-xs text-slate-400">
                            {count} ({percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${color.bar} rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-slate-500 text-sm py-8">No data available</p>
              )}
            </div>
          </div>

          {/* Quick Usage Stats */}
          <div className="lg:col-span-2 rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <h2 className="text-sm font-semibold text-white">Usage This Month</h2>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="grid grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-4 w-24 bg-white/10 rounded mb-2" />
                      <div className="h-8 w-16 bg-white/5 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
                    <p className="text-xs font-medium text-cyan-400 uppercase tracking-wider mb-1">
                      Chat Messages
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {(stats?.usageThisMonth?.chatMessages || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                    <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-1">
                      Voice Minutes
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {(stats?.usageThisMonth?.voiceMinutes || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/10">
                    <p className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-1">
                      Sessions
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {(stats?.usageThisMonth?.sessions || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
