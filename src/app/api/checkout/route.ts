import { NextResponse } from 'next/server'
// Server-only Stripe client (lives in src/lib/stripe.ts and is never
// bundled into the client thanks to `import 'server-only'`).
import { stripe } from '@/lib/stripe'
// Client-safe plan definitions (no Stripe SDK import). Importing this
// from '@/lib/plans' instead of '@/lib/stripe' keeps the Stripe SDK out
// of any chunk that might be shared with the client bundle.
import { PLANS, isPlanId, getPublicAssetUrl } from '@/lib/plans'
import type Stripe from 'stripe'

/**
 * POST /api/checkout
 *
 * Body: { plan: 'base' | 'upsell' | 'pro' }
 *
 * Creates a Stripe Checkout Session in embedded mode and returns the
 * `client_secret` needed to mount the form on /checkout.
 *
 * Why embedded mode:
 *  - No redirect to checkout.stripe.com — the form lives inside our page
 *  - We keep full control of the surrounding layout (image, title, etc.)
 *  - Stripe still handles all card validation, 3DS, SCA, PCI scope
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

  // For embedded mode Stripe requires an absolute HTTPS return_url (used
  // for 3DS / SCA redirects). Fall back to a placeholder if NEXT_PUBLIC_BASE_URL
  // is not configured yet — the call will still succeed for non-3DS cards.
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '') ||
    'https://example.com'
  const returnUrl = `${baseUrl}/checkout?plan=${plan.id}&status=return`

  // Optional line-item image. Stripe requires a public HTTPS URL; in dev
  // we may not have one, so we omit it gracefully.
  const imageUrl = getPublicAssetUrl(plan.image)

  try {
    const session = await stripe.checkout.sessions.create({
      mode: plan.mode,
      ui_mode: 'embedded',
      locale: 'fr',
      // Note: currency is implicit in the line-item price_data.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency,
            unit_amount: plan.amount,
            product_data: {
              name: plan.name,
              description: plan.description,
              ...(imageUrl ? { images: [imageUrl] } : {}),
            },
          },
        },
      ],
      // Collect the buyer's email so we can deliver the access link.
      // We do not ask for a shipping address (digital product).
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
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Never leak the secret key in error responses. Stripe errors do not
    // include the key, but we strip the type just in case.
    return NextResponse.json(
      {
        error: 'Failed to create Stripe Checkout session.',
        detail: message,
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
    body: { plan: 'base | upsell | pro' },
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      amount: p.amount,
      currency: p.currency,
      formatted: `${(p.amount / 100).toLocaleString('fr-FR', {
        style: 'currency',
        currency: p.currency.toUpperCase(),
      })}`,
    })),
  })
}

// Type re-export to keep Stripe types in scope without runtime cost.
export type { Stripe }
