/* eslint-disable @typescript-eslint/consistent-type-imports */
/**
 * Billing - Stripe integration for RC Engine tier subscriptions.
 *
 * Handles:
 *   1. Creating checkout sessions for tier upgrades
 *   2. Processing Stripe webhooks (checkout.session.completed, subscription events)
 *   3. Managing subscription state (active/canceled/past_due)
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY     - Stripe API key (sk_test_... or sk_live_...)
 *   STRIPE_WEBHOOK_SECRET - Webhook signing secret (whsec_...)
 *   STRIPE_PRICE_PRO_MONTHLY     - Price ID for Pro monthly
 *   STRIPE_PRICE_PRO_ANNUAL      - Price ID for Pro annual
 *
 * Setup: Create these products/prices in the Stripe Dashboard first.
 */

import type { Request, Response, Router } from 'express';
import { updateUserTier } from './auth.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface PriceMapping {
  monthly: string;
  annual: string;
}

interface CheckoutRequest {
  tierId: 'pro';
  billing: 'monthly' | 'annual';
  successUrl?: string;
  cancelUrl?: string;
}

// ── Stripe Integration ──────────────────────────────────────────────────────

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Price IDs from Stripe Dashboard (set via env vars)
const PRICE_MAP: Record<string, PriceMapping> = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL || '',
  },
};

/** Validate a URL is same-origin or a relative path (prevents open redirect). */
function isSameOriginUrl(url: string | undefined, expectedHost: string): url is string {
  if (!url) return false;
  if (url.startsWith('/')) return true; // relative paths are safe
  try {
    const parsed = new URL(url);
    return parsed.host === expectedHost;
  } catch {
    return false;
  }
}

/** Check if Stripe is configured. */
export function isStripeConfigured(): boolean {
  return STRIPE_KEY.startsWith('sk_');
}

/**
 * Lazy-load Stripe SDK to avoid hard dependency when not configured.
 * Returns null if Stripe is not configured.
 */
async function getStripe(): Promise<import('stripe').default | null> {
  if (!isStripeConfigured()) return null;
  try {
    const { default: Stripe } = await import('stripe');
    return new Stripe(STRIPE_KEY);
  } catch {
    console.warn('[billing] Stripe SDK not installed. Run: npm install stripe');
    return null;
  }
}

/**
 * Register billing routes on an Express router.
 */
export function registerBillingRoutes(router: Router): void {
  // Get billing status (is Stripe configured, user's current tier)
  router.get('/api/billing/status', (req: Request, res: Response) => {
    res.json({
      stripeConfigured: isStripeConfigured(),
      userTier: req.user?.tier || 'free',
      userId: req.user?.id || null,
    });
  });

  // Create a checkout session for tier upgrade
  router.post('/api/billing/checkout', async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { tierId, billing, successUrl, cancelUrl } = req.body as CheckoutRequest;

    if (!tierId || !billing) {
      res.status(400).json({ error: 'Missing tierId or billing period.' });
      return;
    }

    const priceMapping = PRICE_MAP[tierId];
    if (!priceMapping) {
      res.status(400).json({ error: `Invalid tier: ${tierId}. Choose "pro".` });
      return;
    }

    const priceId = billing === 'annual' ? priceMapping.annual : priceMapping.monthly;
    if (!priceId) {
      res.status(400).json({
        error: `Stripe price not configured for ${tierId} ${billing}. Set STRIPE_PRICE_${tierId.toUpperCase()}_${billing.toUpperCase()} env var.`,
      });
      return;
    }

    const stripe = await getStripe();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in your .env file.' });
      return;
    }

    // Validate redirect URLs are same-origin (prevent open redirect)
    const host = req.get('host') || 'localhost';
    const baseUrl = `${req.protocol}://${host}`;
    const safeSuccessUrl = isSameOriginUrl(successUrl, host) ? successUrl : `${baseUrl}/?billing=success`;
    const safeCancelUrl = isSameOriginUrl(cancelUrl, host) ? cancelUrl : `${baseUrl}/?billing=canceled`;

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: req.user.id,
        customer_email: req.user.email,
        metadata: {
          userId: req.user.id,
          tierId,
          billing,
        },
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error('[billing] Checkout error:', err);
      res.status(500).json({ error: 'Failed to create checkout session.' });
    }
  });

  // Stripe webhook handler
  router.post('/api/billing/webhook', async (req: Request, res: Response) => {
    const stripe = await getStripe();
    if (!stripe) {
      res.status(503).json({ error: 'Stripe not configured.' });
      return;
    }

    const sig = req.headers['stripe-signature'] as string;
    if (!sig || !WEBHOOK_SECRET) {
      res.status(400).json({ error: 'Missing webhook signature or secret.' });
      return;
    }

    let event: import('stripe').Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('[billing] Webhook signature verification failed:', err);
      res.status(400).json({ error: 'Invalid signature.' });
      return;
    }

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          client_reference_id?: string;
          metadata?: { userId?: string; tierId?: string };
        };
        const userId = session.client_reference_id || session.metadata?.userId;
        const tierId = session.metadata?.tierId;
        if (userId && tierId) {
          updateUserTier(userId, tierId);
          console.log(`[billing] User ${userId} upgraded to ${tierId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        // Downgrade to free on cancellation
        const sub = event.data.object as { metadata?: { userId?: string } };
        const userId = sub.metadata?.userId;
        if (userId) {
          updateUserTier(userId, 'free');
          console.log(`[billing] User ${userId} downgraded to free (subscription canceled)`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as { subscription_details?: { metadata?: { userId?: string } } };
        const userId = invoice.subscription_details?.metadata?.userId;
        if (userId) {
          console.warn(`[billing] Payment failed for user ${userId}`);
          // Keep current tier but flag for follow-up
        }
        break;
      }

      default:
        // Unhandled event type - no action needed
        break;
    }

    res.json({ received: true });
  });

  // Get available plans (for pricing page)
  router.get('/api/billing/plans', (_req: Request, res: Response) => {
    res.json({
      configured: isStripeConfigured(),
      plans: [
        {
          tierId: 'pro',
          name: 'Pro',
          monthlyPrice: 79,
          annualPrice: 66,
          hasMonthlyPrice: !!PRICE_MAP.pro.monthly,
          hasAnnualPrice: !!PRICE_MAP.pro.annual,
        },
      ],
    });
  });
}
