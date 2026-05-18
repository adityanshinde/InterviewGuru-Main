import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  change?: number;
  changeLabel?: string;
  colorClass?: string;
  loading?: boolean;
}

export default function StatsCard({
  title,
  value,
  icon,
  change,
  changeLabel = 'vs last month',
  colorClass = 'emerald',
  loading = false,
}: StatsCardProps) {
  const colorStyles: Record<string, { bg: string; border: string; icon: string }> = {
    emerald: {
      bg: 'bg-emerald-500/5',
      border: 'border-emerald-500/20',
      icon: 'text-emerald-400',
    },
    blue: {
      bg: 'bg-blue-500/5',
      border: 'border-blue-500/20',
      icon: 'text-blue-400',
    },
    purple: {
      bg: 'bg-purple-500/5',
      border: 'border-purple-500/20',
      icon: 'text-purple-400',
    },
    amber: {
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/20',
      icon: 'text-amber-400',
    },
    rose: {
      bg: 'bg-rose-500/5',
      border: 'border-rose-500/20',
      icon: 'text-rose-400',
    },
  };

  const colors = colorStyles[colorClass] || colorStyles.emerald;

  if (loading) {
    return (
      <div className={`rounded-xl border ${colors.border} ${colors.bg} p-5 animate-pulse`}>
        <div className="flex items-start justify-between mb-4">
          <div className="h-4 w-24 bg-white/10 rounded" />
          <div className="h-10 w-10 bg-white/10 rounded-lg" />
        </div>
        <div className="h-8 w-20 bg-white/10 rounded mb-2" />
        <div className="h-3 w-32 bg-white/10 rounded" />
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-5 transition-all hover:border-opacity-40`}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        <div className={`p-2.5 rounded-lg bg-white/5 ${colors.icon}`}>
          {icon}
        </div>
      </div>
      
      <div className="text-2xl font-bold text-white mb-2">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      
      {change !== undefined && (
        <div className="flex items-center gap-1.5 text-xs">
          {change >= 0 ? (
            <span className="flex items-center gap-0.5 text-emerald-400">
              <TrendingUp size={12} />
              +{change}%
            </span>
          ) : (
            <span className="flex items-center gap-0.5 text-rose-400">
              <TrendingDown size={12} />
              {change}%
            </span>
          )}
          <span className="text-slate-500">{changeLabel}</span>
        </div>
      )}
    </div>
  );
}
