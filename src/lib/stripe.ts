import 'server-only'
import Stripe from 'stripe'

/**
 * Server-only Stripe client singleton — LAZILY initialized.
 *
 * The secret key lives in `.env.local` (gitignored) and is NEVER sent to
 * the browser. This module is only imported from server code (route
 * handlers, server actions), so the secret never crosses the wire.
 *
 * Client-safe plan definitions live in src/lib/plans.ts so the /checkout
 * page can import them without dragging the Stripe SDK into the client
 * bundle. This file re-exports them for backwards compatibility with the
 * API routes that previously imported them from here.
 *
 * ----------------------------------------------------------------------------
 * WHY LAZY INITIALIZATION (critical for Vercel / Netlify / any PaaS):
 * ----------------------------------------------------------------------------
 * Next.js evaluates route modules during the BUILD step "Collecting page
 * data" to prerender static metadata. Environment variables are NOT
 * available during the build — they are only injected at runtime.
 *
 * If we did `export const stripe = new Stripe(secretKey, ...)` at module
 * scope, the build would throw "STRIPE_SECRET_KEY is not set" because
 * the secret is missing from the build environment. The Vercel deploy
 * fails with "Failed to collect page data for /api/checkout".
 *
 * The fix: defer initialization until the first real method call. The
 * Proxy below intercepts every property access on `stripe` and forwards
 * it to a real instance that is created on demand. At build time, the
 * module is imported but no method is called, so no error. At runtime,
 * the first call to `stripe.checkout.sessions.create(...)` triggers the
 * initialization — by then the env var is available.
 */

let _stripe: Stripe | null = null

function getStripeInstance(): Stripe {
  if (_stripe) return _stripe
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to the Vercel Environment Variables dashboard (Project → Settings → Environment Variables) and redeploy. Locally, add it to .env.local.'
    )
  }
  _stripe = new Stripe(secretKey, {
    // 2025-08-27 is the latest pinned API version bundled with stripe@23.
    apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: {
      name: 'Le trésor du soudeur',
      version: '1.0.0',
    },
  })
  return _stripe
}

/**
 * Lazy Proxy that pretends to be a Stripe instance. The real instance is
 * only created on the first property access (i.e. the first time a route
 * handler actually calls `stripe.checkout.sessions.create(...)`).
 *
 * This preserves the existing `import { stripe } from '@/lib/stripe'` API
 * so we don't have to rewrite the route handlers.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, _receiver) {
    const instance = getStripeInstance()
    const value = Reflect.get(instance, prop) as unknown
    // Bind methods so `this` is correct inside Stripe SDK calls.
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(instance)
      : value
  },
})

// Re-export client-safe types + helpers so API routes can keep their
// existing `import { PLANS, ... } from '@/lib/stripe'`.
export {
  PLANS,
  BUMPS,
  isPlanId,
  isBumpId,
  sanitizeBumpSelection,
  computeTotalCents,
  getPublicAssetUrl,
  formatPrice,
  type Plan,
  type PlanId,
  type Bump,
  type BumpId,
} from './plans'
