import type { Request, Response } from 'express';
import type Stripe from 'stripe';
import {
	constructWebhookEvent,
	saveSubscription,
	handleSubscriptionDeleted,
	savePayment,
	handlePaymentFailed,
	getPlanFromPriceId,
} from '../../services/stripeService';
import { getPool, isDBConnected } from '../../services/database';

async function handleCheckoutSessionCompleted(
	session: Stripe.Checkout.Session
): Promise<void> {
	console.log('[Stripe Webhook] checkout.session.completed:', session.id);

	const userId = session.metadata?.clerk_user_id;
	if (!userId) {
		console.warn('[Stripe Webhook] No clerk_user_id in checkout session metadata');
		return;
	}

	// The subscription will be handled by customer.subscription.created event
	// Just log for now
	console.log(`[Stripe Webhook] Checkout completed for user: ${userId}`);
}

async function handleSubscriptionCreated(
	subscription: Stripe.Subscription
): Promise<void> {
	console.log('[Stripe Webhook] customer.subscription.created:', subscription.id);

	const userId = subscription.metadata?.clerk_user_id;
	if (!userId) {
		// Try to find user by customer ID
		const customerId = subscription.customer as string;
		if (isDBConnected()) {
			const pool = getPool()!;
			const { rows } = await pool.query(
				'SELECT clerk_user_id FROM ig_users WHERE stripe_customer_id = $1',
				[customerId]
			);
			if (rows.length) {
				await saveSubscription(rows[0].clerk_user_id, subscription);
				return;
			}
		}
		console.warn('[Stripe Webhook] Cannot find user for subscription:', subscription.id);
		return;
	}

	await saveSubscription(userId, subscription);
}

async function handleSubscriptionUpdated(
	subscription: Stripe.Subscription
): Promise<void> {
	console.log('[Stripe Webhook] customer.subscription.updated:', subscription.id);

	const userId = subscription.metadata?.clerk_user_id;
	if (!userId) {
		// Try to find user by customer ID
		const customerId = subscription.customer as string;
		if (isDBConnected()) {
			const pool = getPool()!;
			const { rows } = await pool.query(
				'SELECT clerk_user_id FROM ig_users WHERE stripe_customer_id = $1',
				[customerId]
			);
			if (rows.length) {
				await saveSubscription(rows[0].clerk_user_id, subscription);
				return;
			}
		}
		console.warn('[Stripe Webhook] Cannot find user for subscription update:', subscription.id);
		return;
	}

	await saveSubscription(userId, subscription);

	// Log plan change if any
	const priceId = subscription.items.data[0]?.price?.id;
	const plan = priceId ? getPlanFromPriceId(priceId) : null;
	console.log(`[Stripe Webhook] Subscription ${subscription.id} updated: status=${subscription.status}, plan=${plan}`);
}

async function handleSubscriptionDeleted_Event(
	subscription: Stripe.Subscription
): Promise<void> {
	console.log('[Stripe Webhook] customer.subscription.deleted:', subscription.id);
	await handleSubscriptionDeleted(subscription);
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
	console.log('[Stripe Webhook] invoice.paid:', invoice.id);

	const customerId = invoice.customer as string;
	if (!isDBConnected()) return;

	const pool = getPool()!;
	const { rows } = await pool.query(
		'SELECT clerk_user_id FROM ig_users WHERE stripe_customer_id = $1',
		[customerId]
	);

	if (!rows.length) {
		console.warn('[Stripe Webhook] Cannot find user for paid invoice:', invoice.id);
		return;
	}

	await savePayment(rows[0].clerk_user_id, invoice);
	console.log(`[Stripe Webhook] Invoice ${invoice.id} paid: $${(invoice.amount_paid / 100).toFixed(2)}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
	console.log('[Stripe Webhook] invoice.payment_failed:', invoice.id);
	await handlePaymentFailed(invoice);
	console.log(`[Stripe Webhook] Payment failed for invoice ${invoice.id}`);
}

export async function stripeWebhookHandler(
	req: Request,
	res: Response
): Promise<void> {
	const signature = req.headers['stripe-signature'];

	if (!signature || typeof signature !== 'string') {
		res.status(400).json({ error: 'Missing stripe-signature header' });
		return;
	}

	let event: Stripe.Event;

	try {
		event = constructWebhookEvent(req.body, signature);
	} catch (err: any) {
		console.error('[Stripe Webhook] Signature verification failed:', err.message);
		res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
		return;
	}

	try {
		switch (event.type) {
			case 'checkout.session.completed':
				await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
				break;

			case 'customer.subscription.created':
				await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
				break;

			case 'customer.subscription.updated':
				await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
				break;

			case 'customer.subscription.deleted':
				await handleSubscriptionDeleted_Event(event.data.object as Stripe.Subscription);
				break;

			case 'invoice.paid':
				await handleInvoicePaid(event.data.object as Stripe.Invoice);
				break;

			case 'invoice.payment_failed':
				await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
				break;

			default:
				console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
		}

		res.json({ received: true });
	} catch (err: any) {
		console.error(`[Stripe Webhook] Error handling ${event.type}:`, err);
		res.status(500).json({ error: `Webhook handler failed: ${err.message}` });
	}
}
