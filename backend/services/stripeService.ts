import Stripe from 'stripe';
import { getPool, isDBConnected } from './database';
import type { PlanTier } from '../../shared/constants/planLimits';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
	if (!stripe) {
		const secretKey = process.env.STRIPE_SECRET_KEY;
		if (!secretKey) {
			throw new Error('STRIPE_SECRET_KEY is not set');
		}
		stripe = new Stripe(secretKey, {
			apiVersion: '2025-04-30.basil',
			typescript: true,
		});
	}
	return stripe;
}

export function isStripeConfigured(): boolean {
	return !!process.env.STRIPE_SECRET_KEY;
}

export interface StripePriceConfig {
	basic: string;
	pro: string;
}

export function getStripePrices(): StripePriceConfig {
	return {
		basic: process.env.STRIPE_PRICE_BASIC || '',
		pro: process.env.STRIPE_PRICE_PRO || '',
	};
}

export function getPlanFromPriceId(priceId: string): PlanTier | null {
	const prices = getStripePrices();
	if (priceId === prices.basic) return 'basic';
	if (priceId === prices.pro) return 'pro';
	return null;
}

export async function createOrGetStripeCustomer(
	userId: string,
	email: string,
	name?: string
): Promise<string> {
	if (!isDBConnected()) {
		throw new Error('Database not connected');
	}

	const pool = getPool()!;
	const s = getStripe();

	// Check if user already has a Stripe customer
	const { rows } = await pool.query(
		'SELECT stripe_customer_id FROM ig_users WHERE clerk_user_id = $1',
		[userId]
	);

	if (rows[0]?.stripe_customer_id) {
		return rows[0].stripe_customer_id;
	}

	// Create a new Stripe customer
	const customer = await s.customers.create({
		email,
		name,
		metadata: {
			clerk_user_id: userId,
		},
	});

	// Save Stripe customer ID to database
	await pool.query(
		'UPDATE ig_users SET stripe_customer_id = $2, updated_at = NOW() WHERE clerk_user_id = $1',
		[userId, customer.id]
	);

	return customer.id;
}

export async function getStripeCustomerId(userId: string): Promise<string | null> {
	if (!isDBConnected()) return null;

	const pool = getPool()!;
	const { rows } = await pool.query(
		'SELECT stripe_customer_id FROM ig_users WHERE clerk_user_id = $1',
		[userId]
	);

	return rows[0]?.stripe_customer_id || null;
}

export interface CreateCheckoutSessionParams {
	userId: string;
	email: string;
	priceId: string;
	successUrl: string;
	cancelUrl: string;
}

export async function createCheckoutSession(
	params: CreateCheckoutSessionParams
): Promise<Stripe.Checkout.Session> {
	const { userId, email, priceId, successUrl, cancelUrl } = params;
	const s = getStripe();

	const customerId = await createOrGetStripeCustomer(userId, email);

	const session = await s.checkout.sessions.create({
		customer: customerId,
		payment_method_types: ['card'],
		line_items: [
			{
				price: priceId,
				quantity: 1,
			},
		],
		mode: 'subscription',
		success_url: successUrl,
		cancel_url: cancelUrl,
		subscription_data: {
			metadata: {
				clerk_user_id: userId,
			},
		},
		metadata: {
			clerk_user_id: userId,
		},
	});

	return session;
}

export async function createBillingPortalSession(
	userId: string
): Promise<Stripe.BillingPortal.Session> {
	const s = getStripe();

	const customerId = await getStripeCustomerId(userId);
	if (!customerId) {
		throw new Error('No Stripe customer found for user');
	}

	const returnUrl = process.env.STRIPE_BILLING_PORTAL_RETURN_URL ||
		process.env.NEXT_PUBLIC_APP_URL ||
		'http://localhost:3000/settings';

	const session = await s.billingPortal.sessions.create({
		customer: customerId,
		return_url: returnUrl,
	});

	return session;
}

export interface SubscriptionInfo {
	id: string;
	status: string;
	plan: PlanTier;
	priceId: string;
	currentPeriodStart: Date;
	currentPeriodEnd: Date;
	cancelAtPeriodEnd: boolean;
	canceledAt: Date | null;
}

export async function getSubscription(userId: string): Promise<SubscriptionInfo | null> {
	if (!isDBConnected()) return null;

	const pool = getPool()!;
	const { rows } = await pool.query(
		`SELECT stripe_subscription_id, stripe_price_id, plan, status,
            current_period_start, current_period_end, cancel_at_period_end, canceled_at
     FROM ig_subscriptions
     WHERE clerk_user_id = $1 AND status IN ('active', 'trialing', 'past_due')
     ORDER BY created_at DESC LIMIT 1`,
		[userId]
	);

	if (!rows.length) return null;

	const row = rows[0];
	return {
		id: row.stripe_subscription_id,
		status: row.status,
		plan: row.plan as PlanTier,
		priceId: row.stripe_price_id,
		currentPeriodStart: new Date(row.current_period_start),
		currentPeriodEnd: new Date(row.current_period_end),
		cancelAtPeriodEnd: row.cancel_at_period_end,
		canceledAt: row.canceled_at ? new Date(row.canceled_at) : null,
	};
}

export async function cancelSubscription(
	userId: string,
	immediately: boolean = false
): Promise<Stripe.Subscription> {
	const s = getStripe();
	const subscription = await getSubscription(userId);

	if (!subscription) {
		throw new Error('No active subscription found');
	}

	if (immediately) {
		return await s.subscriptions.cancel(subscription.id);
	} else {
		return await s.subscriptions.update(subscription.id, {
			cancel_at_period_end: true,
		});
	}
}

export async function reactivateSubscription(userId: string): Promise<Stripe.Subscription> {
	const s = getStripe();
	const subscription = await getSubscription(userId);

	if (!subscription) {
		throw new Error('No subscription found');
	}

	return await s.subscriptions.update(subscription.id, {
		cancel_at_period_end: false,
	});
}

export async function getInvoices(
	userId: string,
	limit: number = 10
): Promise<Stripe.Invoice[]> {
	const s = getStripe();
	const customerId = await getStripeCustomerId(userId);

	if (!customerId) {
		return [];
	}

	const invoices = await s.invoices.list({
		customer: customerId,
		limit,
	});

	return invoices.data;
}

export async function saveSubscription(
	userId: string,
	subscription: Stripe.Subscription
): Promise<void> {
	if (!isDBConnected()) return;

	const pool = getPool()!;
	const priceId = subscription.items.data[0]?.price?.id || '';
	const plan = getPlanFromPriceId(priceId) || 'basic';

	await pool.query(
		`INSERT INTO ig_subscriptions (
      clerk_user_id, stripe_subscription_id, stripe_customer_id, stripe_price_id,
      plan, status, current_period_start, current_period_end,
      cancel_at_period_end, canceled_at, ended_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status = EXCLUDED.status,
      stripe_price_id = EXCLUDED.stripe_price_id,
      plan = EXCLUDED.plan,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      canceled_at = EXCLUDED.canceled_at,
      ended_at = EXCLUDED.ended_at,
      updated_at = NOW()`,
		[
			userId,
			subscription.id,
			subscription.customer as string,
			priceId,
			plan,
			subscription.status,
			new Date(subscription.current_period_start * 1000),
			new Date(subscription.current_period_end * 1000),
			subscription.cancel_at_period_end,
			subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
			subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
		]
	);

	// Update user's plan in ig_users
	const newStatus = subscription.status === 'active' || subscription.status === 'trialing'
		? 'active'
		: subscription.status === 'canceled'
			? 'cancelled'
			: subscription.status === 'past_due'
				? 'expired'
				: 'active';

	await pool.query(
		`UPDATE ig_users SET
      plan = $2,
      subscription_status = $3,
      updated_at = NOW()
    WHERE clerk_user_id = $1`,
		[userId, plan, newStatus]
	);
}

export async function handleSubscriptionDeleted(
	subscription: Stripe.Subscription
): Promise<void> {
	if (!isDBConnected()) return;

	const pool = getPool()!;
	const userId = subscription.metadata?.clerk_user_id;

	if (!userId) {
		console.warn('[Stripe] Subscription deleted but no clerk_user_id in metadata');
		return;
	}

	// Mark subscription as ended
	await pool.query(
		`UPDATE ig_subscriptions SET
      status = 'canceled',
      ended_at = NOW(),
      updated_at = NOW()
    WHERE stripe_subscription_id = $1`,
		[subscription.id]
	);

	// Downgrade user to free plan
	await pool.query(
		`UPDATE ig_users SET
      plan = 'free',
      subscription_status = 'cancelled',
      updated_at = NOW()
    WHERE clerk_user_id = $1`,
		[userId]
	);
}

export async function savePayment(
	userId: string,
	invoice: Stripe.Invoice
): Promise<void> {
	if (!isDBConnected()) return;

	const pool = getPool()!;

	await pool.query(
		`INSERT INTO ig_payments (
      clerk_user_id, stripe_payment_intent_id, stripe_invoice_id,
      stripe_subscription_id, amount_cents, currency, status, description
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
      status = EXCLUDED.status`,
		[
			userId,
			invoice.payment_intent as string || null,
			invoice.id,
			invoice.subscription as string || null,
			invoice.amount_paid,
			invoice.currency,
			invoice.status,
			invoice.description || `Invoice ${invoice.number || invoice.id}`,
		]
	);
}

export async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
	if (!isDBConnected()) return;

	const pool = getPool()!;

	// Find user by customer ID
	const customerId = invoice.customer as string;
	const { rows } = await pool.query(
		'SELECT clerk_user_id FROM ig_users WHERE stripe_customer_id = $1',
		[customerId]
	);

	if (!rows.length) {
		console.warn('[Stripe] Payment failed but no user found for customer:', customerId);
		return;
	}

	const userId = rows[0].clerk_user_id;

	// Record the failed payment
	await pool.query(
		`INSERT INTO ig_payments (
      clerk_user_id, stripe_payment_intent_id, stripe_invoice_id,
      stripe_subscription_id, amount_cents, currency, status, description
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (stripe_invoice_id) DO UPDATE SET
      status = EXCLUDED.status`,
		[
			userId,
			invoice.payment_intent as string || null,
			invoice.id,
			invoice.subscription as string || null,
			invoice.amount_due,
			invoice.currency,
			'failed',
			`Payment failed for invoice ${invoice.number || invoice.id}`,
		]
	);

	// Update subscription status if exists
	if (invoice.subscription) {
		await pool.query(
			`UPDATE ig_subscriptions SET
        status = 'past_due',
        updated_at = NOW()
      WHERE stripe_subscription_id = $1`,
			[invoice.subscription as string]
		);

		await pool.query(
			`UPDATE ig_users SET
        subscription_status = 'expired',
        updated_at = NOW()
      WHERE clerk_user_id = $1`,
			[userId]
		);
	}
}

export function constructWebhookEvent(
	payload: Buffer,
	signature: string
): Stripe.Event {
	const s = getStripe();
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

	if (!webhookSecret) {
		throw new Error('STRIPE_WEBHOOK_SECRET is not set');
	}

	return s.webhooks.constructEvent(payload, signature, webhookSecret);
}
