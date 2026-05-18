import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { SessionsTable } from '../../components/dashboard/SessionsTable';
import { SessionDetailModal } from '../../components/dashboard/SessionDetailModal';
import { Session } from '../../components/dashboard/RecentSessionsList';
import { useSessions } from '../../hooks/useSessions';

export function SessionsPage() {
  const { sessions, total, loading, error, deleteSession, exportSession, refetch } = useSessions();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleViewSession = (session: Session) => {
    setSelectedSession(session);
  };

  const handleCloseModal = () => {
    setSelectedSession(null);
  };

  const handleDeleteSession = async (sessionId: string) => {
    setDeleteConfirm(sessionId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteSession(deleteConfirm);
      setDeleteConfirm(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete session');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportSession = async (sessionId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const blob = await exportSession(sessionId);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${sessionId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to export session');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Sessions</h1>
          <p className="mt-2 text-slate-400">
            View and manage your interview practice sessions.
          </p>
        </div>
        <Link
          to="/app"
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-400 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Session
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-sm text-slate-400">Total Sessions</p>
          <p className="text-2xl font-bold text-white mt-1">{loading ? '...' : total}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-sm text-slate-400">Voice Sessions</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            {loading ? '...' : sessions.filter(s => s.type === 'voice').length}
          </p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-sm text-slate-400">Chat Sessions</p>
          <p className="text-2xl font-bold text-violet-400 mt-1">
            {loading ? '...' : sessions.filter(s => s.type === 'chat').length}
          </p>
        </div>
      </div>

      {/* Error State */}
      {(error || actionError) && (
        <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-rose-300">{error || actionError}</p>
          </div>
          <button
            onClick={() => {
              setActionError(null);
              refetch();
            }}
            className="text-sm text-rose-400 hover:text-rose-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Sessions Table */}
      <SessionsTable
        sessions={sessions}
        loading={loading}
        onViewSession={handleViewSession}
        onDeleteSession={handleDeleteSession}
        onExportSession={handleExportSession}
      />

      {/* Session Detail Modal */}
      <SessionDetailModal
        session={selectedSession}
        onClose={handleCloseModal}
        onExport={handleExportSession}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-2">Delete Session?</h3>
            <p className="text-slate-400 mb-6">
              Are you sure you want to delete this session? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-500 text-white font-medium rounded-lg hover:bg-rose-400 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {actionLoading && !deleteConfirm && (
        <div className="fixed bottom-6 right-6 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 flex items-center gap-3 shadow-xl">
          <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-300">Processing...</span>
        </div>
      )}
    </DashboardLayout>
  );
}
