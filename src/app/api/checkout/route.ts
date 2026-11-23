import { NextResponse } from 'next/server'
// Server-only Stripe client (lives in src/lib/stripe.ts and is never
// bundled into the client thanks to `import 'server-only'`).
import { stripe } from '@/lib/stripe'
// Client-safe plan + bump definitions (no Stripe SDK import).
import {
  PLANS,
  BUMPS,
  isPlanId,
  sanitizeBumpSelection,
  computeTotalCents,
  getPublicAssetUrl,
  formatPrice,
  type BumpId,
} from '@/lib/plans'
import type Stripe from 'stripe'

/**
 * POST /api/checkout
 *
 * Body: {
 *   plan:  'base' | 'upsell' | 'pro',
 *   bumps?: BumpId[]   // optional order bumps (3 individuals + 1 combo)
 * }
 *
 * Creates a Stripe Checkout Session in embedded mode with the main
 * plan + any selected bumps as separate line_items. Returns the
 * `client_secret` needed to mount the form on /checkout.
 *
 * Security:
 *  - The plan id is validated against the canonical PLANS table.
 *  - The bumps array is validated AND sanitized by sanitizeBumpSelection(),
 *    which enforces the mutual-exclusion rule (combo vs individuals).
 *  - Prices are read from the canonical BUMPS table — the client never
 *    sends prices, only ids.
 *  - The Stripe secret key is never sent to the client.
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 }
    )
  }

  const planRaw = (body as { plan?: unknown } | null)?.plan
  if (typeof planRaw !== 'string' || !isPlanId(planRaw)) {
    return NextResponse.json(
      { error: "Missing or invalid 'plan'. Expected one of: base, upsell, pro." },
      { status: 400 }
    )
  }

  const plan = PLANS[planRaw]

  // Server-side validation of the bumps selection.
  // sanitizeBumpSelection enforces the mutual-exclusion rule:
  // combo "Pack Atelier Rentable" cannot be combined with the individual
  // bumps it contains.
  const rawBumps = (body as { bumps?: unknown } | null)?.bumps
  const bumpIds = sanitizeBumpSelection(rawBumps) as BumpId[]

  // For embedded mode Stripe requires an absolute HTTPS return_url (used
  // for 3DS / SCA redirects). Fall back to a placeholder if
  // NEXT_PUBLIC_BASE_URL is not configured yet — the call will still
  // succeed for non-3DS cards.
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '') ||
    'https://example.com'
  const returnUrl = `${baseUrl}/checkout?plan=${plan.id}&status=return`

  // Build the line_items array. Always includes the main plan; appends
  // one line item per selected bump. Each line item uses inline
  // price_data so we don't need to keep Stripe Products in sync with
  // our config — the source of truth is the PLANS/BUMPS tables here.
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []

  // Main plan
  const planImageUrl = getPublicAssetUrl(plan.image)
  lineItems.push({
    quantity: 1,
    price_data: {
      currency: plan.currency,
      unit_amount: plan.amount,
      product_data: {
        name: plan.name,
        description: plan.description,
        ...(planImageUrl ? { images: [planImageUrl] } : {}),
        metadata: { kind: 'main_plan', plan_id: plan.id },
      },
    },
  })

  // Bumps (each one as its own line item, so Stripe shows them clearly
  // in the order summary AND in the line-item-level metadata returned to
  // the webhook — this is how the delivery system knows which files to
  // send).
  for (const bumpId of bumpIds) {
    const bump = BUMPS[bumpId]
    const bumpImageUrl = getPublicAssetUrl(bump.image)
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: bump.currency,
        unit_amount: bump.amount,
        product_data: {
          name: bump.name,
          description: bump.description,
          ...(bumpImageUrl ? { images: [bumpImageUrl] } : {}),
          metadata: {
            kind: 'order_bump',
            bump_id: bump.id,
            is_combo: bump.isCombo ? 'true' : 'false',
            ...(bump.contains
              ? { contains: bump.contains.join(',') }
              : {}),
          },
        },
      },
    })
  }

  const totalCents = computeTotalCents(plan.id, bumpIds)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: plan.mode,
      ui_mode: 'embedded',
      locale: 'fr',
      line_items: lineItems,
      // Collect the buyer's email so we can deliver the access link.
      customer_creation: 'always',
      // After the form is submitted, Stripe.js reports checkout.completed
      // in the client. The return_url is only used for 3DS challenge
      // redirects.
      return_url: returnUrl,
      // Digital product — no shipping, no phone.
      submit_type: 'pay',
      billing_address_collection: 'auto',
      metadata: {
        plan: plan.id,
        site: 'le-tresor-du-soudeur',
        // Store the bump ids at the session level too — redundant with
        // the line-item metadata, but makes the webhook simpler.
        bumps: bumpIds.length > 0 ? bumpIds.join(',') : 'none',
        total_cents: String(totalCents),
      },
      // Custom text shown above the Pay button in the Stripe iframe.
      custom_text: {
        submit: {
          message:
            'Paiement unique · Accès numérique immédiat par e-mail · Sans abonnement',
        },
      },
    })

    if (!session.client_secret) {
      // Should never happen for embedded sessions, but be defensive.
      return NextResponse.json(
        { error: 'Stripe did not return a client_secret for this session.' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      client_secret: session.client_secret,
      session_id: session.id,
      plan: plan.id,
      bumps: bumpIds,
      total_cents: totalCents,
      total_formatted: formatPrice(totalCents, plan.currency),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Never leak the secret key in error responses. Stripe errors do not
    // include the key, but we strip the type just in case.
    // If the error is about a missing env var, point the user to the
    // /api/debug/env endpoint so they can verify what's actually set
    // on the Vercel runtime.
    const isEnvMissingError = message.toLowerCase().includes('is not set')
    return NextResponse.json(
      {
        error: 'Failed to create Stripe Checkout session.',
        detail: message,
        ...(isEnvMissingError
          ? {
              debugUrl: '/api/debug/env',
              debugHint:
                'Open /api/debug/env in your browser to see which Stripe env vars are actually present on the Vercel runtime. Most common cause: env var saved in the dashboard but no redeploy was triggered after.',
            }
          : {}),
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/checkout
 * Simple health-check / docs endpoint so curl-ing the URL gives a
 * readable response instead of a 405.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/checkout',
    method: 'POST',
    body: { plan: 'base | upsell | pro', bumps: 'BumpId[] (optional)' },
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      amount: p.amount,
      formatted: formatPrice(p.amount, p.currency),
    })),
    bumps: Object.values(BUMPS).map((b) => ({
      id: b.id,
      name: b.name,
      amount: b.amount,
      formatted: formatPrice(b.amount, b.currency),
      is_combo: b.isCombo,
      ...(b.contains ? { contains: b.contains } : {}),
    })),
  })
}

// Type re-export to keep Stripe types in scope without runtime cost.
export type { Stripe }
