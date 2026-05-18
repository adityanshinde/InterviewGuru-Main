import { useState } from 'react';
import { Settings, Save, RefreshCw, Shield, Database, Bell } from 'lucide-react';
import AdminLayout from '@frontend/components/admin/AdminLayout';

export default function AdminSettings() {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
  };

  return (
    <AdminLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Settings className="text-amber-400" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Settings</h1>
              <p className="text-sm text-slate-400">
                Configure admin panel preferences
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* Security Settings */}
          <div className="rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
              <Shield size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Security</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Admin Role Metadata Key
                </label>
                <input
                  type="text"
                  defaultValue="role"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Clerk publicMetadata key used to determine admin access
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Admin Role Value
                </label>
                <input
                  type="text"
                  defaultValue="admin"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Value that grants admin access
                </p>
              </div>
            </div>
          </div>

          {/* Database Settings */}
          <div className="rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
              <Database size={16} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Database</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Connection Status</p>
                  <p className="text-xs text-slate-500">PostgreSQL database connection</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Connected
                </span>
              </div>
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs text-slate-400 mb-2">
                  To add the is_banned column to existing database, run:
                </p>
                <code className="block px-3 py-2 bg-black/30 rounded-lg text-xs text-emerald-400 font-mono overflow-x-auto">
                  ALTER TABLE ig_users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
                </code>
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="rounded-xl border border-white/5 bg-slate-900/50 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/5">
              <Bell size={16} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-white">Notifications</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">New User Alerts</p>
                  <p className="text-xs text-slate-500">Get notified when new users sign up</p>
                </div>
                <button className="relative w-10 h-5 rounded-full bg-emerald-500 transition-colors">
                  <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Subscription Alerts</p>
                  <p className="text-xs text-slate-500">Get notified on plan changes</p>
                </div>
                <button className="relative w-10 h-5 rounded-full bg-slate-600 transition-colors">
                  <span className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">Usage Alerts</p>
                  <p className="text-xs text-slate-500">Get notified when users hit quota limits</p>
                </div>
                <button className="relative w-10 h-5 rounded-full bg-emerald-500 transition-colors">
                  <span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform" />
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <button
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              Reset to Defaults
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
