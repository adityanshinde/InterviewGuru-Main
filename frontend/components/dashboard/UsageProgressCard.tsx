interface UsageProgressCardProps {
  title: string;
  used: number;
  limit: number;
  unit?: string;
  icon: React.ReactNode;
  color?: 'emerald' | 'cyan' | 'violet';
}

const colorClasses = {
  emerald: {
    bar: 'bg-emerald-500',
    barBg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
  },
  cyan: {
    bar: 'bg-cyan-500',
    barBg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
  },
  violet: {
    bar: 'bg-violet-500',
    barBg: 'bg-violet-500/20',
    text: 'text-violet-400',
  },
};

export function UsageProgressCard({ title, used, limit, unit = '', icon, color = 'emerald' }: UsageProgressCardProps) {
  const percentUsed = limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const colors = colorClasses[color];
  
  let statusColor = 'text-emerald-400';
  let barColor = colors.bar;
  if (percentUsed >= 80) {
    statusColor = 'text-rose-400';
    barColor = 'bg-rose-500';
  } else if (percentUsed >= 50) {
    statusColor = 'text-amber-400';
    barColor = 'bg-amber-500';
  }

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.barBg} ${colors.text}`}>
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400">
              {used.toLocaleString()} / {limit.toLocaleString()}{unit}
            </p>
          </div>
        </div>
        <div className={`text-2xl font-bold ${statusColor}`}>
          {Math.round(percentUsed)}%
        </div>
      </div>

      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentUsed}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-500">
          {remaining.toLocaleString()}{unit} remaining
        </span>
        {percentUsed >= 80 && (
          <span className="text-rose-400 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Running low
          </span>
        )}
      </div>
    </div>
  );
}
