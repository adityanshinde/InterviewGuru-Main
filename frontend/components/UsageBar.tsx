interface UsageBarProps {
	label: string;
	used: number;
	limit: number;
	unit?: string;
	periodLabel?: string;
}

export function UsageBar({ label, used, limit, unit = '', periodLabel = 'month' }: UsageBarProps) {
	const percentUsed = limit === 0 ? 0 : (used / limit) * 100;
	const remaining = Math.max(0, limit - used);

	let tone: 'ok' | 'warn' | 'danger' = 'ok';
	if (percentUsed >= 50) tone = 'warn';
	if (percentUsed >= 80) tone = 'danger';

	return (
		<div className={`usage-card tone-${tone}`}>
			<div className="usage-card-head">
				<span className="usage-card-label">{label}</span>
				<span className="usage-card-meta">
					{Math.round(percentUsed)}% used ({used}/{limit}
					{unit})
				</span>
			</div>

			<div className="usage-track">
				<div
					className="usage-fill"
					style={{ width: `${Math.min(100, percentUsed)}%` }}
				/>
			</div>

			<div className="usage-foot">
				{remaining}
				{unit} remaining this {periodLabel}
			</div>
		</div>
	);
}