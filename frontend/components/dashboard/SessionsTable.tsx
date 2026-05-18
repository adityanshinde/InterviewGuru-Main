import { useState } from 'react';
import { Session } from './RecentSessionsList';

interface SessionsTableProps {
  sessions: Session[];
  loading?: boolean;
  onViewSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onExportSession: (sessionId: string) => void;
}

const difficultyColors = {
  easy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  hard: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

type SortKey = 'createdAt' | 'duration' | 'questionsCount';
type SortOrder = 'asc' | 'desc';

export function SessionsTable({ sessions, loading, onViewSession, onDeleteSession, onExportSession }: SessionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [typeFilter, setTypeFilter] = useState<'all' | 'voice' | 'chat'>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const filteredSessions = sessions.filter((session) => {
    if (typeFilter !== 'all' && session.type !== typeFilter) return false;
    if (difficultyFilter !== 'all' && session.difficulty !== difficultyFilter) return false;
    return true;
  });

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    let comparison = 0;
    switch (sortKey) {
      case 'createdAt':
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case 'duration':
        comparison = a.duration - b.duration;
        break;
      case 'questionsCount':
        comparison = a.questionsCount - b.questionsCount;
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const SortIcon = ({ active, order }: { active: boolean; order: SortOrder }) => (
    <svg className={`w-4 h-4 ${active ? 'text-emerald-400' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={order === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
    </svg>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse bg-slate-800/50 rounded-lg h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All</option>
            <option value="voice">Voice</option>
            <option value="chat">Chat</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Difficulty:</span>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value as typeof difficultyFilter)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <span className="text-sm text-slate-500 ml-auto">
          {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {sortedSessions.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 border border-slate-800 rounded-xl">
          <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-slate-400">No sessions match your filters</p>
        </div>
      ) : (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Title</th>
                <th 
                  className="px-6 py-4 text-left text-sm font-semibold text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('createdAt')}
                >
                  <div className="flex items-center gap-1">
                    Date
                    <SortIcon active={sortKey === 'createdAt'} order={sortOrder} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-sm font-semibold text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('duration')}
                >
                  <div className="flex items-center gap-1">
                    Duration
                    <SortIcon active={sortKey === 'duration'} order={sortOrder} />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-sm font-semibold text-slate-400 cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort('questionsCount')}
                >
                  <div className="flex items-center gap-1">
                    Questions
                    <SortIcon active={sortKey === 'questionsCount'} order={sortOrder} />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">Difficulty</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSessions.map((session) => (
                <tr key={session.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className={`
                      w-8 h-8 rounded-lg flex items-center justify-center
                      ${session.type === 'voice' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-violet-500/10 text-violet-400'}
                    `}>
                      {session.type === 'voice' ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-white font-medium">
                    {session.title || 'Interview Session'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {formatDate(session.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {formatDuration(session.duration)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {session.questionsCount}
                  </td>
                  <td className="px-6 py-4">
                    {session.difficulty && (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${difficultyColors[session.difficulty]}`}>
                        {session.difficulty}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onViewSession(session)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                        title="View details"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onExportSession(session.id)}
                        className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="Export"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDeleteSession(session.id)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
