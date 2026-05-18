import { PlanTier, PLAN_LIMITS } from '../../../shared/constants/planLimits';

interface PlanCardProps {
  plan: PlanTier;
  isCurrentPlan?: boolean;
  onSelect?: () => void;
  recommended?: boolean;
}

const planColors: Record<PlanTier, { gradient: string; border: string; badge: string }> = {
  free: {
    gradient: 'from-slate-600 to-slate-700',
    border: 'border-slate-600/50',
    badge: 'bg-slate-600',
  },
  basic: {
    gradient: 'from-cyan-600 to-blue-600',
    border: 'border-cyan-500/50',
    badge: 'bg-cyan-600',
  },
  pro: {
    gradient: 'from-emerald-500 to-cyan-500',
    border: 'border-emerald-500/50',
    badge: 'bg-emerald-500',
  },
  enterprise: {
    gradient: 'from-violet-600 to-purple-600',
    border: 'border-violet-500/50',
    badge: 'bg-violet-600',
  },
};

export function PlanCard({ plan, isCurrentPlan, onSelect, recommended }: PlanCardProps) {
  const config = PLAN_LIMITS[plan];
  const colors = planColors[plan];

  const formatPrice = () => {
    if (config.price === null) return 'Custom';
    if (config.price === 0) return 'Free';
    return `$${config.price}`;
  };

  const features = [
    { label: 'Voice minutes/month', value: config.voiceMinutesPerMonth === 99999 ? 'Unlimited' : config.voiceMinutesPerMonth },
    { label: 'Chat messages/month', value: config.chatMessagesPerMonth === 99999 ? 'Unlimited' : config.chatMessagesPerMonth },
    { label: 'Sessions/month', value: config.sessionsPerMonth === 99999 ? 'Unlimited' : config.sessionsPerMonth },
    { label: 'Text-to-Speech', value: config.features.textToSpeech },
    { label: 'Session Export', value: config.features.sessionExport },
    { label: 'Custom Personas', value: config.features.customPersonas },
    { label: 'Cache Generation', value: config.features.cacheGeneration },
    { label: 'Advanced Analytics', value: config.features.advancedAnalytics },
  ];

  return (
    <div className={`
      relative rounded-2xl border-2 ${colors.border} overflow-hidden
      ${isCurrentPlan ? 'ring-2 ring-emerald-500/50' : ''}
      ${recommended ? 'scale-105 shadow-2xl shadow-emerald-500/20' : ''}
      transition-all hover:scale-[1.02]
    `}>
      {recommended && (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-center text-sm font-semibold py-1">
          Recommended
        </div>
      )}
      
      {isCurrentPlan && !recommended && (
        <div className="absolute top-0 left-0 right-0 bg-slate-700 text-white text-center text-sm font-semibold py-1">
          Current Plan
        </div>
      )}

      <div className={`p-6 ${recommended || isCurrentPlan ? 'pt-10' : ''}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center`}>
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">{config.name}</h3>
            <p className="text-sm text-slate-400">{config.notes}</p>
          </div>
        </div>

        <div className="mb-6">
          <span className="text-4xl font-bold text-white">{formatPrice()}</span>
          {config.price !== null && config.price > 0 && (
            <span className="text-slate-400 ml-1">/{config.billingPeriod}</span>
          )}
        </div>

        <ul className="space-y-3 mb-6">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-center gap-3">
              {typeof feature.value === 'boolean' ? (
                feature.value ? (
                  <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )
              ) : (
                <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span className={typeof feature.value === 'boolean' && !feature.value ? 'text-slate-500' : 'text-slate-300'}>
                {typeof feature.value === 'boolean' 
                  ? feature.label 
                  : `${feature.value} ${feature.label.toLowerCase()}`}
              </span>
            </li>
          ))}
        </ul>

        {onSelect && !isCurrentPlan && (
          <button
            onClick={onSelect}
            className={`
              w-full py-3 px-4 rounded-lg font-semibold transition-all
              ${recommended 
                ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-400 hover:to-cyan-400 shadow-lg shadow-emerald-500/25' 
                : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'
              }
            `}
          >
            {plan === 'enterprise' ? 'Contact Sales' : isCurrentPlan ? 'Current Plan' : 'Upgrade'}
          </button>
        )}

        {isCurrentPlan && (
          <button
            disabled
            className="w-full py-3 px-4 rounded-lg font-semibold bg-slate-800/50 text-slate-500 border border-slate-700/50 cursor-not-allowed"
          >
            Current Plan
          </button>
        )}
      </div>
    </div>
  );
}
