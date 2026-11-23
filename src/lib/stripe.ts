import 'server-only'
import Stripe from 'stripe'

/**
 * Server-only Stripe client singleton.
 *
 * The secret key lives in `.env.local` (gitignored) and is NEVER sent to
 * the browser. This module is only imported from server code (route
 * handlers, server actions), so the secret never crosses the wire.
 *
 * Client-safe plan definitions live in src/lib/plans.ts so the /checkout
 * page can import them without dragging the Stripe SDK into the client
 * bundle. This file re-exports them for backwards compatibility with the
 * API routes that previously imported them from here.
 */
declare global {
  var __stripe: Stripe | undefined
}

function createStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local (server-side only).'
    )
  }
  // 2025-08-27 is the latest pinned API version bundled with stripe@23.
  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: {
      name: 'Le trésor du soudeur',
      version: '1.0.0',
    },
  })
}

export const stripe: Stripe =
  globalThis.__stripe ?? (globalThis.__stripe = createStripeClient())

// Re-export client-safe types + helpers so API routes can keep their
// existing `import { PLANS, ... } from '@/lib/stripe'`.
export {
  PLANS,
  isPlanId,
  getPublicAssetUrl,
  type Plan,
  type PlanId,
} from './plans'
