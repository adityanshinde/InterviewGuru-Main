interface DataPoint {
  date: string;
  voiceMinutes: number;
  chatMessages: number;
  sessions: number;
}

interface UsageChartProps {
  data: DataPoint[];
  loading?: boolean;
}

export function UsageChart({ data, loading }: UsageChartProps) {
  if (loading) {
    return (
      <div className="h-64 bg-slate-800/50 rounded-xl animate-pulse" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center justify-center">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-slate-400">No usage data yet</p>
        </div>
      </div>
    );
  }

  const maxVoice = Math.max(...data.map(d => d.voiceMinutes), 1);
  const maxChat = Math.max(...data.map(d => d.chatMessages), 1);
  const maxSessions = Math.max(...data.map(d => d.sessions), 1);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-white">Usage Over Time</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-slate-400">Voice</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500" />
            <span className="text-slate-400">Chat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-500" />
            <span className="text-slate-400">Sessions</span>
          </div>
        </div>
      </div>

      <div className="h-48 flex items-end gap-2">
        {data.map((point, idx) => (
          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center gap-0.5 h-40">
              <div 
                className="w-2 bg-emerald-500 rounded-t transition-all hover:bg-emerald-400"
                style={{ height: `${(point.voiceMinutes / maxVoice) * 100}%`, minHeight: point.voiceMinutes > 0 ? '4px' : '0' }}
                title={`${point.voiceMinutes} voice minutes`}
              />
              <div 
                className="w-2 bg-cyan-500 rounded-t transition-all hover:bg-cyan-400"
                style={{ height: `${(point.chatMessages / maxChat) * 100}%`, minHeight: point.chatMessages > 0 ? '4px' : '0' }}
                title={`${point.chatMessages} chat messages`}
              />
              <div 
                className="w-2 bg-violet-500 rounded-t transition-all hover:bg-violet-400"
                style={{ height: `${(point.sessions / maxSessions) * 100}%`, minHeight: point.sessions > 0 ? '4px' : '0' }}
                title={`${point.sessions} sessions`}
              />
            </div>
            <span className="text-xs text-slate-500 truncate w-full text-center">
              {formatDate(point.date)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
