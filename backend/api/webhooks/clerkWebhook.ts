import { Router, Request, Response } from 'express';
import { Webhook } from 'svix';
import { routeWebhookEvent, WebhookEventType } from '../../services/webhookHandlers';

const router = Router();

interface WebhookEvent {
  type: string;
  data: unknown;
  object: 'event';
}

function getWebhookSecret(): string {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    throw new Error('CLERK_WEBHOOK_SIGNING_SECRET is not set in environment variables');
  }
  return secret;
}

router.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Get the headers for verification
  const svix_id = req.headers['svix-id'] as string | undefined;
  const svix_timestamp = req.headers['svix-timestamp'] as string | undefined;
  const svix_signature = req.headers['svix-signature'] as string | undefined;

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('[Webhook] Missing svix headers');
    return res.status(400).json({ error: 'Missing svix headers' });
  }

  // Get the raw body as string (must be raw, not JSON parsed)
  const body = req.body;
  if (!body || typeof body !== 'string') {
    console.error('[Webhook] Invalid body format - must use express.raw() middleware');
    return res.status(400).json({ error: 'Invalid body format' });
  }

  let event: WebhookEvent;

  try {
    const secret = getWebhookSecret();
    const wh = new Webhook(secret);

    // Verify and parse the webhook
    event = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Log the incoming event
  console.log(`[Webhook] Received event: ${event.type} at ${new Date().toISOString()}`);

  // Respond immediately (Clerk expects 2xx within timeout)
  res.status(200).json({ received: true });

  // Process the event asynchronously
  try {
    const supportedEvents: WebhookEventType[] = [
      'user.created',
      'user.updated',
      'user.deleted',
      'session.created',
      'session.ended',
    ];

    if (supportedEvents.includes(event.type as WebhookEventType)) {
      await routeWebhookEvent(event.type as WebhookEventType, event.data);
      const duration = Date.now() - startTime;
      console.log(`[Webhook] Processed ${event.type} in ${duration}ms`);
    } else {
      console.log(`[Webhook] Ignoring unsupported event type: ${event.type}`);
    }
  } catch (error: any) {
    // Log but don't fail - we already sent 200
    console.error(`[Webhook] Error processing ${event.type}:`, error.message);
  }
});

// Health check endpoint for webhook debugging
router.get('/health', (req: Request, res: Response) => {
  const hasSecret = !!process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  res.json({
    status: 'ok',
    webhookSecretConfigured: hasSecret,
    timestamp: new Date().toISOString(),
  });
});

export default router;
