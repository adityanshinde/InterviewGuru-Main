import { Router, Request, Response } from 'express';
import {
	isStripeConfigured,
	getStripePrices,
	createCheckoutSession,
	createBillingPortalSession,
	getSubscription,
	cancelSubscription,
	reactivateSubscription,
	getInvoices,
} from '../../services/stripeService';
import { AuthRequest } from '../../../shared/types';
import { PLAN_LIMITS, PlanTier } from '../../../shared/constants/planLimits';

const router = Router();

function validatePlan(plan: string): plan is 'basic' | 'pro' {
	return plan === 'basic' || plan === 'pro';
}

router.post('/create-checkout', async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;

		if (!authReq.user) {
			res.status(401).json({ error: 'User not authenticated' });
			return;
		}

		if (!isStripeConfigured()) {
			res.status(503).json({ error: 'Stripe is not configured' });
			return;
		}

		const { plan, successUrl, cancelUrl } = req.body;

		if (!plan || !validatePlan(plan)) {
			res.status(400).json({ error: 'Invalid plan. Must be "basic" or "pro"' });
			return;
		}

		const prices = getStripePrices();
		const priceId = plan === 'basic' ? prices.basic : prices.pro;

		if (!priceId) {
			res.status(500).json({ error: `Price not configured for ${plan} plan` });
			return;
		}

		const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
		const finalSuccessUrl = successUrl || `${baseUrl}/settings?checkout=success`;
		const finalCancelUrl = cancelUrl || `${baseUrl}/settings?checkout=cancelled`;

		const session = await createCheckoutSession({
			userId: authReq.user.userId,
			email: authReq.user.email,
			priceId,
			successUrl: finalSuccessUrl,
			cancelUrl: finalCancelUrl,
		});

		res.json({
			sessionId: session.id,
			url: session.url,
		});
	} catch (error: any) {
		console.error('[Billing] Create checkout error:', error);
		res.status(500).json({ error: error.message || 'Failed to create checkout session' });
	}
});

router.post('/portal', async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;

		if (!authReq.user) {
			res.status(401).json({ error: 'User not authenticated' });
			return;
		}

		if (!isStripeConfigured()) {
			res.status(503).json({ error: 'Stripe is not configured' });
			return;
		}

		const session = await createBillingPortalSession(authReq.user.userId);

		res.json({
			url: session.url,
		});
	} catch (error: any) {
		console.error('[Billing] Create portal error:', error);

		if (error.message === 'No Stripe customer found for user') {
			res.status(404).json({ error: 'No billing account found. Please subscribe to a plan first.' });
			return;
		}

		res.status(500).json({ error: error.message || 'Failed to create billing portal session' });
	}
});

router.get('/subscription', async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;

		if (!authReq.user) {
			res.status(401).json({ error: 'User not authenticated' });
			return;
		}

		const subscription = await getSubscription(authReq.user.userId);

		if (!subscription) {
			res.json({
				hasSubscription: false,
				plan: authReq.user.plan || 'free',
				planDetails: PLAN_LIMITS[authReq.user.plan || 'free'],
			});
			return;
		}

		res.json({
			hasSubscription: true,
			subscription: {
				id: subscription.id,
				status: subscription.status,
				plan: subscription.plan,
				planDetails: PLAN_LIMITS[subscription.plan as PlanTier],
				currentPeriodStart: subscription.currentPeriodStart.toISOString(),
				currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
				cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
				canceledAt: subscription.canceledAt?.toISOString() || null,
			},
		});
	} catch (error: any) {
		console.error('[Billing] Get subscription error:', error);
		res.status(500).json({ error: error.message || 'Failed to get subscription' });
	}
});

router.post('/cancel', async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;

		if (!authReq.user) {
			res.status(401).json({ error: 'User not authenticated' });
			return;
		}

		if (!isStripeConfigured()) {
			res.status(503).json({ error: 'Stripe is not configured' });
			return;
		}

		const { immediately } = req.body;

		const subscription = await cancelSubscription(authReq.user.userId, immediately === true);

		res.json({
			message: immediately
				? 'Subscription cancelled immediately'
				: 'Subscription will be cancelled at the end of the billing period',
			cancelAtPeriodEnd: subscription.cancel_at_period_end,
			currentPeriodEnd: subscription.current_period_end
				? new Date(subscription.current_period_end * 1000).toISOString()
				: null,
		});
	} catch (error: any) {
		console.error('[Billing] Cancel subscription error:', error);

		if (error.message === 'No active subscription found') {
			res.status(404).json({ error: 'No active subscription to cancel' });
			return;
		}

		res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
	}
});

router.post('/reactivate', async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;

		if (!authReq.user) {
			res.status(401).json({ error: 'User not authenticated' });
			return;
		}

		if (!isStripeConfigured()) {
			res.status(503).json({ error: 'Stripe is not configured' });
			return;
		}

		const subscription = await reactivateSubscription(authReq.user.userId);

		res.json({
			message: 'Subscription reactivated',
			status: subscription.status,
			cancelAtPeriodEnd: subscription.cancel_at_period_end,
		});
	} catch (error: any) {
		console.error('[Billing] Reactivate subscription error:', error);

		if (error.message === 'No subscription found') {
			res.status(404).json({ error: 'No subscription found to reactivate' });
			return;
		}

		res.status(500).json({ error: error.message || 'Failed to reactivate subscription' });
	}
});

router.get('/invoices', async (req: Request, res: Response) => {
	try {
		const authReq = req as AuthRequest;

		if (!authReq.user) {
			res.status(401).json({ error: 'User not authenticated' });
			return;
		}

		const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
		const invoices = await getInvoices(authReq.user.userId, limit);

		res.json({
			invoices: invoices.map((invoice) => ({
				id: invoice.id,
				number: invoice.number,
				status: invoice.status,
				amountPaid: invoice.amount_paid,
				amountDue: invoice.amount_due,
				currency: invoice.currency,
				created: new Date(invoice.created * 1000).toISOString(),
				periodStart: invoice.period_start
					? new Date(invoice.period_start * 1000).toISOString()
					: null,
				periodEnd: invoice.period_end
					? new Date(invoice.period_end * 1000).toISOString()
					: null,
				invoicePdf: invoice.invoice_pdf,
				hostedInvoiceUrl: invoice.hosted_invoice_url,
			})),
		});
	} catch (error: any) {
		console.error('[Billing] Get invoices error:', error);
		res.status(500).json({ error: error.message || 'Failed to get invoices' });
	}
});

router.get('/plans', (_req: Request, res: Response) => {
	const plans = Object.entries(PLAN_LIMITS).map(([key, config]) => ({
		id: key,
		name: config.name,
		price: config.price,
		currency: config.currency,
		billingPeriod: config.billingPeriod,
		features: config.features,
		limits: {
			voiceMinutesPerMonth: config.voiceMinutesPerMonth,
			chatMessagesPerMonth: config.chatMessagesPerMonth,
			sessionsPerMonth: config.sessionsPerMonth,
		},
		notes: config.notes,
	}));

	res.json({ plans });
});

export default router;
