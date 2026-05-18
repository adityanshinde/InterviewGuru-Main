interface DataPoint {
  label: string;
  value: number;
}

interface SimpleChartProps {
  data: DataPoint[];
  type: 'bar' | 'line' | 'area';
  title?: string;
  color?: string;
  height?: number;
  loading?: boolean;
  formatValue?: (value: number) => string;
}

export default function SimpleChart({
  data,
  type,
  title,
  color = '#10b981',
  height = 200,
  loading = false,
  formatValue = (v) => v.toLocaleString(),
}: SimpleChartProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-slate-900/50 p-5">
        {title && <div className="h-4 w-32 bg-white/10 rounded mb-4 animate-pulse" />}
        <div 
          className="bg-white/5 rounded-lg animate-pulse"
          style={{ height }}
        />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-slate-900/50 p-5">
        {title && (
          <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
        )}
        <div 
          className="flex items-center justify-center text-slate-500 text-sm"
          style={{ height }}
        >
          No data available
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const getY = (value: number) => {
    return ((maxValue - value) / range) * (height - 40) + 20;
  };

  const getBarHeight = (value: number) => {
    return (value / (maxValue || 1)) * (height - 40);
  };

  const barWidth = Math.min(40, (300 / data.length) - 8);

  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/50 p-5">
      {title && (
        <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      )}
      
      <div className="relative" style={{ height }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-[10px] text-slate-500">
          <span>{formatValue(maxValue)}</span>
          <span>{formatValue(Math.round((maxValue + minValue) / 2))}</span>
          <span>{formatValue(minValue)}</span>
        </div>

        {/* Chart area */}
        <div className="ml-12 h-full">
          {type === 'bar' ? (
            <div className="flex items-end justify-between h-full pb-6 gap-1">
              {data.map((point, i) => (
                <div key={i} className="flex flex-col items-center flex-1 group">
                  <div 
                    className="relative w-full max-w-[40px] rounded-t-sm transition-all duration-300 group-hover:opacity-80"
                    style={{ 
                      height: `${getBarHeight(point.value)}px`,
                      background: `linear-gradient(180deg, ${color} 0%, ${color}40 100%)`,
                      minHeight: '2px',
                    }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 border border-white/10 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap z-10">
                      {formatValue(point.value)}
                    </div>
                  </div>
                  <span className="mt-2 text-[9px] text-slate-500 truncate max-w-full">
                    {point.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <svg 
              className="w-full" 
              style={{ height: height - 20 }}
              viewBox={`0 0 ${data.length * 50} ${height - 20}`}
              preserveAspectRatio="none"
            >
              {type === 'area' && (
                <defs>
                  <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </linearGradient>
                </defs>
              )}
              
              {/* Grid lines */}
              {[0, 1, 2].map((i) => (
                <line
                  key={i}
                  x1="0"
                  y1={20 + (i * (height - 60) / 2)}
                  x2={data.length * 50}
                  y2={20 + (i * (height - 60) / 2)}
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
              ))}

              {/* Area fill */}
              {type === 'area' && (
                <path
                  d={`
                    M 25 ${getY(data[0].value)}
                    ${data.map((point, i) => `L ${25 + i * 50} ${getY(point.value)}`).join(' ')}
                    L ${25 + (data.length - 1) * 50} ${height - 40}
                    L 25 ${height - 40}
                    Z
                  `}
                  fill={`url(#gradient-${title})`}
                />
              )}

              {/* Line */}
              <path
                d={`M 25 ${getY(data[0].value)} ${data.map((point, i) => `L ${25 + i * 50} ${getY(point.value)}`).join(' ')}`}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Points */}
              {data.map((point, i) => (
                <g key={i}>
                  <circle
                    cx={25 + i * 50}
                    cy={getY(point.value)}
                    r="4"
                    fill={color}
                    className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  />
                  <circle
                    cx={25 + i * 50}
                    cy={getY(point.value)}
                    r="2"
                    fill={color}
                  />
                </g>
              ))}
            </svg>
          )}

          {/* X-axis labels for line/area */}
          {(type === 'line' || type === 'area') && (
            <div className="flex justify-between mt-2 px-4">
              {data.filter((_, i) => i % Math.ceil(data.length / 6) === 0).map((point, i) => (
                <span key={i} className="text-[9px] text-slate-500">
                  {point.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface PieChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  title?: string;
  loading?: boolean;
}

export function SimplePieChart({ data, title, loading = false }: PieChartProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-slate-900/50 p-5">
        {title && <div className="h-4 w-32 bg-white/10 rounded mb-4 animate-pulse" />}
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 rounded-full bg-white/5 animate-pulse" />
          <div className="flex-1 space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-4 w-full bg-white/5 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  let cumulativePercent = 0;

  const getCoordinates = (percent: number) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/50 p-5">
      {title && (
        <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      )}
      
      <div className="flex items-center gap-6">
        <svg viewBox="-1 -1 2 2" className="w-32 h-32 -rotate-90">
          {data.map((item, i) => {
            const percent = item.value / total;
            const [startX, startY] = getCoordinates(cumulativePercent);
            cumulativePercent += percent;
            const [endX, endY] = getCoordinates(cumulativePercent);
            const largeArcFlag = percent > 0.5 ? 1 : 0;

            return (
              <path
                key={i}
                d={`M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} L 0 0`}
                fill={item.color}
                className="hover:opacity-80 transition-opacity cursor-pointer"
              />
            );
          })}
          <circle cx="0" cy="0" r="0.6" fill="#0f172a" />
        </svg>

        <div className="flex-1 space-y-2">
          {data.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-slate-400 flex-1">{item.label}</span>
              <span className="text-xs font-medium text-white">
                {item.value.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500">
                ({((item.value / total) * 100).toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
