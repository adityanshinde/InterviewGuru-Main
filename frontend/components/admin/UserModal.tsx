import { useState, useEffect } from 'react';
import { X, User, Mail, Calendar, CreditCard, Activity, Ban, Save, Loader2 } from 'lucide-react';

interface UserDetails {
  userId: string;
  email: string;
  plan: string;
  subscriptionStatus: string;
  billingMonth: string;
  voiceMinutesUsed: number;
  chatMessagesUsed: number;
  sessionsUsed: number;
  createdAt: string;
  updatedAt: string;
  isBanned: boolean;
}

interface UserModalProps {
  isOpen: boolean;
  userId: string | null;
  mode: 'view' | 'edit';
  onClose: () => void;
  onSave?: (userId: string, newPlan: string) => Promise<void>;
  onBan?: (userId: string, banned: boolean) => Promise<void>;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

const planColors: Record<string, string> = {
  free: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  basic: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  pro: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  enterprise: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

export default function UserModal({
  isOpen,
  userId,
  mode,
  onClose,
  onSave,
  onBan,
  getAuthHeaders,
}: UserModalProps) {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserDetails();
    } else {
      setUser(null);
      setSelectedPlan('');
      setError(null);
    }
  }, [isOpen, userId]);

  const fetchUserDetails = async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/users/${userId}`, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user details');
      }
      
      const data = await response.json();
      setUser(data.user);
      setSelectedPlan(data.user.plan);
    } catch (err: any) {
      setError(err.message || 'Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId || !onSave) return;
    
    setSaving(true);
    try {
      await onSave(userId, selectedPlan);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleBan = async () => {
    if (!userId || !user || !onBan) return;
    
    setSaving(true);
    try {
      await onBan(userId, !user.isBanned);
      await fetchUserDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to update ban status');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'edit' ? 'Edit User' : 'User Details'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-rose-400 text-sm">{error}</p>
              <button
                onClick={fetchUserDetails}
                className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white hover:bg-white/10 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : user ? (
            <div className="space-y-6">
              {/* User Info */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-xl font-bold text-emerald-400">
                  {user.email[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-medium text-white truncate">{user.email}</p>
                  <p className="text-xs text-slate-500 font-mono truncate">{user.userId}</p>
                </div>
                {user.isBanned && (
                  <span className="px-2 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
                    Banned
                  </span>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <CreditCard size={14} />
                    <span className="text-xs font-medium uppercase tracking-wider">Plan</span>
                  </div>
                  {mode === 'edit' ? (
                    <select
                      value={selectedPlan}
                      onChange={(e) => setSelectedPlan(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
                    >
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  ) : (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border capitalize ${planColors[user.plan]}`}>
                      {user.plan}
                    </span>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Activity size={14} />
                    <span className="text-xs font-medium uppercase tracking-wider">Status</span>
                  </div>
                  <span className="text-sm text-white capitalize">{user.subscriptionStatus}</span>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Mail size={14} />
                    <span className="text-xs font-medium uppercase tracking-wider">Chat Usage</span>
                  </div>
                  <span className="text-sm text-white">{user.chatMessagesUsed} messages</span>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <User size={14} />
                    <span className="text-xs font-medium uppercase tracking-wider">Voice Usage</span>
                  </div>
                  <span className="text-sm text-white">{user.voiceMinutesUsed} minutes</span>
                </div>
              </div>

              {/* Dates */}
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2">
                    <Calendar size={14} />
                    Joined
                  </span>
                  <span className="text-white">{formatDate(user.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2">
                    <Activity size={14} />
                    Last Active
                  </span>
                  <span className="text-white">{formatDate(user.updatedAt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-2">
                    <CreditCard size={14} />
                    Billing Month
                  </span>
                  <span className="text-white">{user.billingMonth || 'N/A'}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        {user && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 bg-white/[0.01]">
            <button
              onClick={handleBan}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                user.isBanned
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
              }`}
            >
              <Ban size={16} />
              {user.isBanned ? 'Unban User' : 'Ban User'}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              {mode === 'edit' && (
                <button
                  onClick={handleSave}
                  disabled={saving || selectedPlan === user.plan}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Save Changes
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
