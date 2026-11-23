import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { PLANS, isPlanId } from '@/lib/plans'
import type Stripe from 'stripe'

/**
 * POST /api/webhook
 *
 * Receives Stripe events. Currently handles `checkout.session.completed`
 * to mark a purchase as paid and trigger digital delivery (email with the
 * access link). For now it just logs — wire this to your email provider
 * or database when you go to production.
 *
 * Setup:
 *  1. Deploy to a public HTTPS domain.
 *  2. In Stripe Dashboard: Developers > Webhooks > Add endpoint.
 *     URL: https://YOUR_DOMAIN/api/webhook
 *     Events: checkout.session.completed
 *  3. Copy the signing secret (whsec_...) into .env.local as
 *     STRIPE_WEBHOOK_SECRET.
 *
 * Without the webhook you can still detect payment in the client
 * (Stripe.js fires `checkout.completed`), but webhook confirmation is
 * required to be sure the payment actually cleared (clients can be
 * closed / lie).
 */

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

      // TODO: replace with real digital delivery logic.
      //  - Persist the order in the database
      //  - Send the access-link email to `customerEmail`
      console.log(
        `[stripe-webhook] PAYMENT CONFIRMED — plan=${planId}, amount=${formattedAmount}, email=${customerEmail}, session=${session.id}`
      )
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
      // console.debug(`[stripe-webhook] unhandled event: ${event.type}`)
      break
  }

  return NextResponse.json({ received: true })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/webhook',
    method: 'POST',
    description:
      'Receives Stripe events. Configure in Stripe Dashboard with the URL of your deployed site + /api/webhook.',
    configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
  })
}
