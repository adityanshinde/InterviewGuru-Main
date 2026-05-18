# InterviewGuru SaaS Deployment Checklist

This document provides a comprehensive checklist for deploying InterviewGuru as a production-ready SaaS application.

## Pre-Deployment Setup

### 1. Database (Neon PostgreSQL)

- [ ] Create Neon project at https://console.neon.tech
- [ ] Copy connection string (use pooled connection for serverless)
- [ ] Run migrations: `npm run db:migrate`
- [ ] Verify tables created: `ig_users`, `ig_sessions`, `ig_subscriptions`, `ig_payments`, etc.
- [ ] Enable connection pooling for production workloads

### 2. Clerk Authentication

- [ ] Create Clerk application at https://dashboard.clerk.com
- [ ] Configure sign-in/sign-up methods (Email, Google, GitHub)
- [ ] Set up webhook endpoint: `https://yourdomain.com/api/webhooks/clerk`
- [ ] Subscribe to events: `user.created`, `user.updated`, `user.deleted`
- [ ] Copy keys:
  - `CLERK_SECRET_KEY` (sk_live_...)
  - `CLERK_PUBLISHABLE_KEY` (pk_live_...)
  - `CLERK_WEBHOOK_SECRET` (whsec_...)
- [ ] Configure allowed origins in Clerk dashboard
- [ ] Set up admin users (add `role: 'admin'` to publicMetadata)

### 3. Stripe Billing

- [ ] Create Stripe account at https://dashboard.stripe.com
- [ ] Create Products:
  - Basic Plan ($9.99/month)
  - Pro Plan ($29.99/month)
- [ ] Copy Price IDs for each plan
- [ ] Set up webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
- [ ] Subscribe to events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- [ ] Copy keys:
  - `STRIPE_SECRET_KEY` (sk_live_...)
  - `STRIPE_WEBHOOK_SECRET` (whsec_...)
- [ ] Configure Customer Portal

### 4. Groq API (AI Backend)

- [ ] Get API key from https://console.groq.com
- [ ] Set `GROQ_API_KEY` for server-side usage
- [ ] OR enable `BYOK_MODE=true` for user-provided keys

### 5. Google Gemini (TTS)

- [ ] Get API key from Google AI Studio
- [ ] Set `GEMINI_API_KEY` in frontend environment

## Environment Variables

### Backend (.env)

```bash
# Required
DATABASE_URL=postgresql://...
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
GROQ_API_KEY=gsk_...

# Security
CRON_SECRET=<random-32-chars>
API_KEY_ENCRYPTION_KEY=<64-hex-chars>
ALLOWED_ORIGINS=https://yourdomain.com

# Optional
ADMIN_USER_IDS=user_xxx,user_yyy
ABUSE_MAX_SIGNUPS_PER_IP_PER_DAY=3
API_RATE_LIMIT_PER_MINUTE=120
```

### Frontend (.env)

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_API_URL=https://api.yourdomain.com
VITE_BYOK=false
GEMINI_API_KEY=...
```

## Deployment Platforms

### Vercel (Recommended)

1. Connect GitHub repository
2. Set environment variables in Vercel dashboard
3. Configure build settings:
   - Build Command: `npm run build`
   - Output Directory: `build`
4. Set up Vercel Cron for keep-warm:
   ```json
   {
     "crons": [{
       "path": "/api/cron/keep-warm",
       "schedule": "*/5 * * * *"
     }]
   }
   ```

### Railway

1. Create new project from GitHub
2. Add PostgreSQL service (or use Neon)
3. Set environment variables
4. Configure domains

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Post-Deployment Verification

### Functional Tests

- [ ] User can sign up/sign in via Clerk
- [ ] User profile syncs to database
- [ ] Usage tracking works (voice/chat/sessions)
- [ ] Plan limits are enforced
- [ ] Stripe checkout creates subscription
- [ ] Plan upgrades reflect in database
- [ ] Webhooks process correctly
- [ ] Admin panel accessible to admins only

### Security Checks

- [ ] HTTPS enforced
- [ ] CORS configured correctly
- [ ] Rate limiting active
- [ ] Webhook signatures verified
- [ ] API keys encrypted at rest
- [ ] No sensitive data in client bundles

### Performance

- [ ] Database indexes working
- [ ] Connection pooling active
- [ ] CDN configured for static assets
- [ ] Gzip/Brotli compression enabled
- [ ] Keep-warm cron preventing cold starts

## Monitoring Setup

### Error Tracking

- [ ] Sentry configured for error reporting
- [ ] Error alerts set up

### Logging

- [ ] Application logs accessible
- [ ] Audit logs for compliance
- [ ] Webhook event logs

### Analytics

- [ ] PostHog/Amplitude for product analytics
- [ ] Stripe dashboard for revenue metrics
- [ ] Clerk dashboard for user metrics

## Rollback Plan

1. Database migrations are reversible (`npm run db:migrate:down`)
2. Keep previous deployment available
3. Feature flags for gradual rollout
4. Database backups configured (Neon automatic)

## Support & Maintenance

- [ ] Error monitoring dashboard
- [ ] User feedback channel (Intercom/Crisp)
- [ ] Status page (Statuspage.io/Instatus)
- [ ] Documentation for common issues

---

## Quick Deploy Commands

```bash
# Install dependencies
npm install

# Run migrations
npm run db:migrate

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test
```

## Webhook Testing (Local Development)

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use ngrok URL for webhook endpoints in Clerk/Stripe dashboards
```
