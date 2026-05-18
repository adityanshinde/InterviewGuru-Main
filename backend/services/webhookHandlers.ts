import { getPool, isDBConnected } from './database';

interface ClerkUserData {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
  }>;
  primary_email_address_id: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: number;
  updated_at: number;
}

interface ClerkSessionData {
  id: string;
  user_id: string;
  client_id: string;
  status: string;
  created_at: number;
  updated_at: number;
  last_active_at: number;
  expire_at: number;
  abandon_at: number;
}

function getPrimaryEmail(user: ClerkUserData): string {
  if (!user.primary_email_address_id) {
    return user.email_addresses[0]?.email_address || '';
  }
  const primary = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address || user.email_addresses[0]?.email_address || '';
}

function currentBillingMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function handleUserCreated(data: ClerkUserData): Promise<void> {
  console.log(`[Webhook] user.created: ${data.id}`);

  if (!isDBConnected()) {
    console.warn('[Webhook] Database not connected, skipping user creation');
    return;
  }

  const pool = getPool()!;
  const email = getPrimaryEmail(data);
  const month = currentBillingMonth();

  try {
    await pool.query(
      `INSERT INTO ig_users (
        clerk_user_id, email, plan, subscription_status, trial_started_at,
        billing_month, voice_minutes_used, chat_messages_used, sessions_used,
        first_name, last_name, avatar_url, clerk_env, created_at, updated_at
      ) VALUES ($1, $2, 'free', 'trial', NOW(), $3, 0, 0, 0, $4, $5, $6, 'live', NOW(), NOW())
      ON CONFLICT (clerk_user_id) DO NOTHING`,
      [
        data.id,
        email,
        month,
        data.first_name || null,
        data.last_name || null,
        data.image_url || null,
      ]
    );

    console.log(`[Webhook] Created user in ig_users: ${data.id} (${email})`);
  } catch (error) {
    console.error('[Webhook] Failed to create user:', error);
    throw error;
  }
}

export async function handleUserUpdated(data: ClerkUserData): Promise<void> {
  console.log(`[Webhook] user.updated: ${data.id}`);

  if (!isDBConnected()) {
    console.warn('[Webhook] Database not connected, skipping user update');
    return;
  }

  const pool = getPool()!;
  const email = getPrimaryEmail(data);

  try {
    const result = await pool.query(
      `UPDATE ig_users SET
        email = COALESCE($2, email),
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        avatar_url = COALESCE($5, avatar_url),
        updated_at = NOW()
      WHERE clerk_user_id = $1
      RETURNING clerk_user_id`,
      [
        data.id,
        email || null,
        data.first_name || null,
        data.last_name || null,
        data.image_url || null,
      ]
    );

    if (result.rowCount === 0) {
      console.log(`[Webhook] User not found for update, creating: ${data.id}`);
      await handleUserCreated(data);
    } else {
      console.log(`[Webhook] Updated user: ${data.id}`);
    }
  } catch (error) {
    console.error('[Webhook] Failed to update user:', error);
    throw error;
  }
}

export async function handleUserDeleted(data: { id: string; deleted?: boolean }): Promise<void> {
  console.log(`[Webhook] user.deleted: ${data.id}`);

  if (!isDBConnected()) {
    console.warn('[Webhook] Database not connected, skipping user deletion');
    return;
  }

  const pool = getPool()!;

  try {
    // Soft delete: mark user as deleted rather than removing data
    // This preserves analytics and allows potential account recovery
    const result = await pool.query(
      `UPDATE ig_users SET
        subscription_status = 'deleted',
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE clerk_user_id = $1
      RETURNING clerk_user_id`,
      [data.id]
    );

    if (result.rowCount === 0) {
      console.log(`[Webhook] User not found for deletion: ${data.id}`);
    } else {
      console.log(`[Webhook] Soft deleted user: ${data.id}`);
    }

    // Also close any active sessions for this user
    await pool.query(
      `UPDATE ig_sessions SET
        status = 'abandoned',
        ended_at = NOW()
      WHERE user_id = $1 AND status = 'active'`,
      [data.id]
    );
  } catch (error) {
    console.error('[Webhook] Failed to delete user:', error);
    throw error;
  }
}

export async function handleSessionCreated(data: ClerkSessionData): Promise<void> {
  console.log(`[Webhook] session.created: ${data.id} for user ${data.user_id}`);

  if (!isDBConnected()) {
    console.warn('[Webhook] Database not connected, skipping session tracking');
    return;
  }

  const pool = getPool()!;

  try {
    // Track Clerk session starts for analytics
    // This is separate from interview sessions (ig_sessions)
    await pool.query(
      `INSERT INTO ig_clerk_sessions (
        clerk_session_id, clerk_user_id, client_id, status, started_at, last_active_at
      ) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0))
      ON CONFLICT (clerk_session_id) DO UPDATE SET
        status = EXCLUDED.status,
        last_active_at = EXCLUDED.last_active_at`,
      [
        data.id,
        data.user_id,
        data.client_id,
        data.status,
        data.created_at,
        data.last_active_at,
      ]
    );

    console.log(`[Webhook] Tracked session start: ${data.id}`);
  } catch (error: any) {
    // If the table doesn't exist, log and continue (non-critical)
    if (error.code === '42P01') {
      console.log('[Webhook] ig_clerk_sessions table not found, skipping session tracking');
    } else {
      console.error('[Webhook] Failed to track session start:', error);
    }
  }
}

export async function handleSessionEnded(data: ClerkSessionData): Promise<void> {
  console.log(`[Webhook] session.ended: ${data.id} for user ${data.user_id}`);

  if (!isDBConnected()) {
    console.warn('[Webhook] Database not connected, skipping session end tracking');
    return;
  }

  const pool = getPool()!;

  try {
    await pool.query(
      `UPDATE ig_clerk_sessions SET
        status = $2,
        ended_at = NOW(),
        last_active_at = to_timestamp($3 / 1000.0)
      WHERE clerk_session_id = $1`,
      [data.id, data.status || 'ended', data.last_active_at]
    );

    console.log(`[Webhook] Tracked session end: ${data.id}`);
  } catch (error: any) {
    if (error.code === '42P01') {
      console.log('[Webhook] ig_clerk_sessions table not found, skipping session end tracking');
    } else {
      console.error('[Webhook] Failed to track session end:', error);
    }
  }
}

export type WebhookEventType =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'session.created'
  | 'session.ended';

export async function routeWebhookEvent(
  eventType: WebhookEventType,
  data: unknown
): Promise<void> {
  switch (eventType) {
    case 'user.created':
      await handleUserCreated(data as ClerkUserData);
      break;
    case 'user.updated':
      await handleUserUpdated(data as ClerkUserData);
      break;
    case 'user.deleted':
      await handleUserDeleted(data as { id: string; deleted?: boolean });
      break;
    case 'session.created':
      await handleSessionCreated(data as ClerkSessionData);
      break;
    case 'session.ended':
      await handleSessionEnded(data as ClerkSessionData);
      break;
    default:
      console.log(`[Webhook] Unhandled event type: ${eventType}`);
  }
}
