import { PlanTier } from '../../shared/constants/planLimits';

interface PlanBannerProps {
	plan: PlanTier;
	trialDaysRemaining: number;
	onUpgrade: () => void;
}

export function PlanBanner({ plan, trialDaysRemaining, onUpgrade }: PlanBannerProps) {
	void trialDaysRemaining;
	if (plan === 'free') {
		return (
			<div className="plan-banner plan-banner-free">
				<div className="plan-banner-content">
					<div>
						<div className="plan-banner-chip">BYOK</div>
						<h3 className="plan-banner-title">Free BYOK Plan</h3>
						<p className="plan-banner-subtitle">One-time free quota. Upgrade to unlock higher recurring limits.</p>
					</div>
					<button
						onClick={onUpgrade}
						className="plan-banner-cta"
					>
						Upgrade Now
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="plan-banner plan-banner-paid">
			<div className="plan-banner-content">
				<div className="text-sm text-cyan-100">
					You're on the <span className="font-semibold capitalize">{plan}</span> plan
				</div>
			</div>
		</div>
	);
}