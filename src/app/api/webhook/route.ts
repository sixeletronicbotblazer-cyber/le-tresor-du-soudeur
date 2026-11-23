import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { PLANS, BUMPS, isPlanId, isBumpId } from '@/lib/plans'
import type Stripe from 'stripe'

/**
 * POST /api/webhook
 *
 * Receives Stripe events. Handles `checkout.session.completed` to mark a
 * purchase as paid and trigger digital delivery (email with the access
 * link). For now it just logs the per-line-item breakdown — wire this to
 * your email provider or database when you go to production.
 *
 * DELIVERY CONTRACT (read this before going live with order bumps):
 *
 *   The webhook — NOT the client-side `onComplete` callback — is the
 *   source of truth for what was paid. The /checkout page only shows an
 *   optimistic success screen; delivery must be driven by this webhook
 *   because:
 *     1. Clients can be closed before `onComplete` fires.
 *     2. Clients can lie about completion.
 *     3. 3DS redirects go through the `return_url`, not `onComplete`.
 *
 *   For each paid session, we:
 *     1. Fetch the line items from Stripe (server-side, signed).
 *     2. For each line item, read the `product.metadata` we set in
 *        /api/checkout to know whether it is the main plan or a bump,
 *        and which bump id it is.
 *     3. Map each paid bump id to its digital file (PDF guide) and
 *        queue it for email delivery.
 *
 *   CRITICAL — do NOT ship these bumps until the actual digital files
 *   are uploaded to your delivery system. The 4 images in /assets/
 *   are COMMERCIAL COVERS (mockups), not the files to deliver. See
 *   BUMP_DELIVERABLES below for the file map.
 *
 * Setup:
 *  1. Deploy to a public HTTPS domain.
 *  2. In Stripe Dashboard: Developers > Webhooks > Add endpoint.
 *     URL: https://YOUR_DOMAIN/api/webhook
 *     Events: checkout.session.completed, checkout.session.expired
 *  3. Copy the signing secret (whsec_...) into .env.local as
 *     STRIPE_WEBHOOK_SECRET.
 */

// ============================================================
// DELIVERY MAP
// ============================================================
// Map each paid bump id to its digital deliverable.
// Replace the file URLs/paths with the real hosted PDFs (S3, your CDN,
// your email provider's attachment id, etc.) BEFORE activating sale.
// If any of these is empty/missing, the corresponding bump will be
// marked as "delivery pending" rather than "delivered".
//
// The main plan deliverable is the existing "Le trésor du soudeur"
// digital library — already in your delivery system.
const BUMP_DELIVERABLES: Record<
  string,
  { label: string; fileRef: string | null; ready: boolean }
> = {
  'carnet-devis': {
    label: 'Carnet des devis rentables (PDF)',
    // TODO: replace with the real hosted file URL before activating sale.
    fileRef: null,
    ready: false,
  },
  'finitions-metal': {
    label: 'Finitions Métal Pro (PDF)',
    fileRef: null,
    ready: false,
  },
  'plan-coupe': {
    label: 'Plan de coupe anti-chutes (PDF)',
    fileRef: null,
    ready: false,
  },
  'pack-atelier': {
    label: 'Pack Atelier Rentable (3 PDFs — carnet + finitions + plan de coupe)',
    fileRef: null,
    ready: false,
  },
}

// Stripe requires the raw body to verify the signature. Next.js 16 with
// App Router gives us the raw request body when we read the stream
// ourselves (we must NOT use request.json() here).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    // Webhook not configured yet — fail loudly so the operator notices.
    // Once the secret is set, signature verification will be enforced.
    return NextResponse.json(
      {
        error:
          'STRIPE_WEBHOOK_SECRET is not set. Register the webhook in the Stripe Dashboard and add the signing secret to .env.local.',
      },
      { status: 503 }
    )
  }

  // Read raw body for signature verification.
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header.' },
      { status: 400 }
    )
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Webhook signature verification failed.', detail: message },
      { status: 400 }
    )
  }

  // Handle the events we care about.
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const planId = (session.metadata?.plan ?? '') as string

      if (!isPlanId(planId)) {
        console.warn(
          `[stripe-webhook] checkout.session.completed with no/unknown plan: ${planId}`
        )
        break
      }

      const plan = PLANS[planId]
      const customerEmail = session.customer_details?.email ?? '(unknown)'
      const amountTotal = session.amount_total ?? 0
      const formattedAmount = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: plan.currency.toUpperCase(),
      }).format(amountTotal / 100)

      // ============================================================
      // FETCH PAID LINE ITEMS FROM STRIPE
      // ============================================================
      // The session object in the webhook event does NOT include the
      // full line_items array — only a `url` reference. We have to
      // fetch them explicitly with the secret key.
      // This is the authoritative list of what was actually paid for.
      let paidBumpIds: string[] = []
      let mainPlanDelivered = false
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 100 }
        )
        for (const item of lineItems.data) {
          // Each line item has price.product (expanded as an id string).
          // We stored metadata on the product_data, but inline price_data
          // does not preserve product ids across sessions — so we match
          // by name instead. This is fragile; for production we should
          // create real Stripe Products and Prices with stable ids.
          const name = item.description ?? ''
          // Check if this is a bump.
          for (const bump of Object.values(BUMPS)) {
            if (name.includes(bump.name)) {
              paidBumpIds.push(bump.id)
              break
            }
          }
          // Check if this is the main plan.
          if (name.includes(plan.name.split(' — ')[0])) {
            mainPlanDelivered = true
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error(
          `[stripe-webhook] Failed to fetch line items for session ${session.id}: ${message}`
        )
        // Fall back to the session-level metadata bumps field — less
        // authoritative but still useful.
        const fallbackBumps = (session.metadata?.bumps ?? '')
          .split(',')
          .filter((id) => id !== 'none' && id !== '')
        paidBumpIds = fallbackBumps
        mainPlanDelivered = true // assume yes since the session completed
      }

      // ============================================================
      // BUILD DELIVERY QUEUE
      // ============================================================
      // For each paid item, look up its digital deliverable. If the
      // deliverable file is not yet ready (BUMP_DELIVERABLES[id].ready === false),
      // the delivery is marked "pending" — the operator must upload
      // the file before the buyer actually receives it.
      const deliveryQueue: Array<{
        kind: 'main_plan' | 'order_bump'
        bump_id?: string
        label: string
        fileRef: string | null
        ready: boolean
      }> = []

      if (mainPlanDelivered) {
        deliveryQueue.push({
          kind: 'main_plan',
          label: plan.name,
          // The main plan deliverable is the existing library — assumed ready.
          fileRef: 'le-tresor-du-soudeur-library',
          ready: true,
        })
      }

      for (const bumpId of paidBumpIds) {
        if (!isBumpId(bumpId)) continue
        const deliverable = BUMP_DELIVERABLES[bumpId]
        deliveryQueue.push({
          kind: 'order_bump',
          bump_id: bumpId,
          label: deliverable.label,
          fileRef: deliverable.fileRef,
          ready: deliverable.ready,
        })
      }

      // ============================================================
      // TODO: REPLACE WITH REAL DELIVERY LOGIC
      // ============================================================
      // For each item in deliveryQueue:
      //   - if ready === true, send the email with the access link
      //   - if ready === false, queue for manual fulfillment OR
      //     send the main-plan email and add a TODO for the operator
      //
      // For now we just log everything for transparency.
      const pendingItems = deliveryQueue.filter((d) => !d.ready)
      const readyItems = deliveryQueue.filter((d) => d.ready)

      console.log(
        `[stripe-webhook] PAYMENT CONFIRMED
  session:   ${session.id}
  plan:      ${planId} (${formatCents(plan.amount, plan.currency)})
  total:     ${formattedAmount}
  email:     ${customerEmail}
  delivered (ready): ${readyItems.length} item(s)
${readyItems.map((d) => `    ✓ ${d.label}`).join('\n')}
  pending (file not uploaded yet): ${pendingItems.length} item(s)
${pendingItems.map((d) => `    ⏳ ${d.label} [bump_id=${d.bump_id ?? 'main'}]`).join('\n')}`
      )

      if (pendingItems.length > 0) {
        console.warn(
          `[stripe-webhook] WARNING: ${pendingItems.length} bump deliverable(s) not ready — buyer ${customerEmail} paid but will not receive these files until you upload them. See BUMP_DELIVERABLES in src/app/api/webhook/route.ts.`
        )
      }
      break
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      console.log(
        `[stripe-webhook] checkout.session.expired — session=${session.id}, plan=${session.metadata?.plan ?? '?'}`
      )
      break
    }
    default:
      // Acknowledge events we don't handle so Stripe doesn't retry.
      break
  }

  return NextResponse.json({ received: true })
}

function formatCents(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhook',
    method: 'POST',
    description:
      'Receives Stripe events. Configure in Stripe Dashboard with the URL of your deployed site + /api/webhook.',
    configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    bumpDeliverables: Object.fromEntries(
      Object.entries(BUMP_DELIVERABLES).map(([id, d]) => [
        id,
        { label: d.label, ready: d.ready },
      ])
    ),
  })
}
