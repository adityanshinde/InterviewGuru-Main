import { useState } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';

export function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [displayName, setDisplayName] = useState(user?.firstName || '');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [notifications, setNotifications] = useState({
    emailUpdates: true,
    sessionReminders: true,
    usageAlerts: true,
    marketingEmails: false,
  });

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      await user.update({
        firstName: displayName,
      });
      setSaveMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    signOut({ redirectUrl: '/' });
  };

  if (!isLoaded) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Profile Settings</h1>
        <p className="mt-2 text-slate-400">
          Manage your account settings and preferences.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        {/* Profile Info */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Profile Information</h2>
          
          {/* Avatar */}
          <div className="flex items-center gap-6 mb-6">
            <div className="relative">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt="Profile"
                  className="w-20 h-20 rounded-full object-cover border-2 border-slate-700"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center text-2xl font-bold text-white">
                  {user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0] || '?'}
                </div>
              )}
              <button className="absolute bottom-0 right-0 w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white hover:bg-slate-600 transition-colors border-2 border-slate-900">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            <div>
              <p className="text-sm text-slate-400">Profile Photo</p>
              <p className="text-xs text-slate-500 mt-1">JPG, PNG or GIF. Max 5MB.</p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={user?.emailAddresses[0]?.emailAddress || ''}
                disabled
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 cursor-not-allowed"
              />
              <p className="text-xs text-slate-500 mt-1">
                Email is managed by your sign-in provider and cannot be changed here.
              </p>
            </div>

            {saveMessage && (
              <div className={`px-4 py-3 rounded-lg ${
                saveMessage.type === 'success' 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
              }`}>
                {saveMessage.text}
              </div>
            )}

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-6 py-3 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              Save Changes
            </button>
          </div>
        </div>

        {/* Account Info */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Account Details</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <p className="text-sm font-medium text-white">Account ID</p>
                <p className="text-xs text-slate-500 mt-0.5">Your unique identifier</p>
              </div>
              <code className="text-sm text-slate-400 bg-slate-800 px-3 py-1 rounded">
                {user?.id?.slice(0, 16) || 'N/A'}...
              </code>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-slate-800">
              <div>
                <p className="text-sm font-medium text-white">Member Since</p>
                <p className="text-xs text-slate-500 mt-0.5">When you joined</p>
              </div>
              <p className="text-sm text-slate-400">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }) : 'N/A'}
              </p>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-white">Sign-in Method</p>
                <p className="text-xs text-slate-500 mt-0.5">How you access your account</p>
              </div>
              <p className="text-sm text-slate-400 capitalize">
                {user?.externalAccounts?.[0]?.provider || 'Email'}
              </p>
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Notification Preferences</h2>
          
          <div className="space-y-4">
            {[
              { key: 'emailUpdates', label: 'Email Updates', desc: 'Receive updates about your account and sessions' },
              { key: 'sessionReminders', label: 'Session Reminders', desc: 'Get reminded to practice regularly' },
              { key: 'usageAlerts', label: 'Usage Alerts', desc: 'Be notified when approaching usage limits' },
              { key: 'marketingEmails', label: 'Marketing Emails', desc: 'Receive tips, offers, and product news' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
                <button
                  onClick={() => setNotifications(prev => ({ 
                    ...prev, 
                    [item.key]: !prev[item.key as keyof typeof notifications] 
                  }))}
                  className={`
                    relative w-11 h-6 rounded-full transition-colors
                    ${notifications[item.key as keyof typeof notifications] 
                      ? 'bg-emerald-500' 
                      : 'bg-slate-700'
                    }
                  `}
                >
                  <span className={`
                    absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform
                    ${notifications[item.key as keyof typeof notifications] 
                      ? 'translate-x-5' 
                      : 'translate-x-0'
                    }
                  `} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-rose-400 mb-4">Danger Zone</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Sign Out</p>
                <p className="text-xs text-slate-500 mt-0.5">Sign out of your account on this device</p>
              </div>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-rose-500/20">
              <div>
                <p className="text-sm font-medium text-white">Delete Account</p>
                <p className="text-xs text-slate-500 mt-0.5">Permanently delete your account and all data</p>
              </div>
              <button
                className="px-4 py-2 bg-rose-500/10 text-rose-400 font-medium rounded-lg hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
