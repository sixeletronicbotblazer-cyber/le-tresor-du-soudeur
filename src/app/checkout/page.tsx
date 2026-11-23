'use client'

import { useEffect, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import type { StripeEmbeddedCheckout } from '@stripe/stripe-js'
import { PLANS, isPlanId, type PlanId, type Plan } from '@/lib/plans'

// ============================================================
// Stripe.js singleton — loaded once, reused across renders.
// The publishable key is safe to expose to the client.
// ============================================================
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
if (!stripePublishableKey) {
  // Will be caught by the page render below with a friendly message.
  console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.')
}
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : Promise.reject(new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.'))

// ============================================================
// Helpers
// ============================================================
function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}

// ============================================================
// Main checkout component (uses Suspense because useSearchParams
// is required to be wrapped in Suspense by Next.js 16)
// ============================================================
function CheckoutInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const planIdParam = searchParams.get('plan')
  const statusParam = searchParams.get('status')

  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [paid, setPaid] = useState(false)

  // The Stripe embedded checkout instance, kept in a ref so we can
  // unmount it cleanly when the page closes.
  const checkoutRef = useRef<StripeEmbeddedCheckout | null>(null)
  // The DOM node where Stripe mounts the iframe.
  const containerRef = useRef<HTMLDivElement>(null)

  // Validate the plan from the URL.
  useEffect(() => {
    if (!isPlanId(planIdParam)) {
      setError(
        "Plan invalide. Utilisez /checkout?plan=base, /checkout?plan=upsell ou /checkout?plan=pro."
      )
      setLoading(false)
      return
    }
    setPlan(PLANS[planIdParam])
    setLoading(false)
  }, [planIdParam])

  // If Stripe redirected back here after a 3DS challenge, the user has
  // paid — fetch the session status and show the success screen.
  useEffect(() => {
    if (statusParam !== 'return' || !planIdParam) return
    if (!isPlanId(planIdParam)) return
    // Optimistically show success; the webhook is the source of truth
    // for whether the payment really cleared.
    setPaid(true)
  }, [statusParam, planIdParam])

  // Create the Checkout Session and mount the embedded form.
  const mountCheckout = useCallback(
    async (planId: PlanId) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: planId }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string
            detail?: string
          }
          throw new Error(
            body.error
              ? `${body.error}${body.detail ? ` (${body.detail})` : ''}`
              : `HTTP ${res.status}`
          )
        }
        const { client_secret: clientSecret } = (await res.json()) as {
          client_secret: string
          session_id: string
          plan: string
        }
        if (!clientSecret) {
          throw new Error('Stripe did not return a client_secret.')
        }

        const stripe = await stripePromise
        // New Stripe.js API (v10+): createEmbeddedCheckoutPage replaces
        // the deprecated initEmbeddedCheckout. Returns an instance we
        // mount into a DOM node. onComplete fires after successful payment.
        const checkout = await stripe.createEmbeddedCheckoutPage({
          clientSecret,
          onComplete: () => {
            // Payment succeeded — show the success screen.
            // The webhook (/api/webhook) is the authoritative source of
            // truth; this is the optimistic client-side signal.
            setPaid(true)
          },
        })

        // If the component re-mounted, tear down the previous instance.
        checkoutRef.current?.unmount()
        checkout.mount(containerRef.current)
        checkoutRef.current = checkout
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!plan || paid) return
    void mountCheckout(plan.id)
  }, [plan, paid, mountCheckout])

  // Clean up the embedded checkout on unmount.
  useEffect(() => {
    return () => {
      checkoutRef.current?.unmount()
      checkoutRef.current?.destroy()
      checkoutRef.current = null
    }
  }, [])

  // ============================================================
  // Render states
  // ============================================================

  if (error) {
    return (
      <CheckoutShell>
        <ErrorState message={error} onBack={() => router.push('/#packs')} />
      </CheckoutShell>
    )
  }

  if (!plan) {
    // Invalid plan id (handled in useEffect but render before error set).
    return (
      <CheckoutShell>
        <LoadingState />
      </CheckoutShell>
    )
  }

  if (paid) {
    return (
      <CheckoutShell>
        <SuccessState plan={plan} />
      </CheckoutShell>
    )
  }

  return (
    <CheckoutShell>
      <ProductHeader plan={plan} />
      {/* The container is always in the DOM so that mountCheckout()
          can call checkout.mount(containerRef.current) without the
          reference being null because of an earlier loading-state
          unmount. The Stripe iframe is appended inside this div once
          the session is ready. */}
      <div ref={containerRef} className="min-h-[400px]" aria-busy={loading} />
      {loading && (
        <div className="-mt-[400px] flex flex-col items-center justify-center py-20 text-center pointer-events-none">
          <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground text-sm">
            Préparation du paiement sécurisé…
          </p>
        </div>
      )}
    </CheckoutShell>
  )
}

// ============================================================
// Sub-components
// ============================================================

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 flex flex-col bg-background">
      <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {children}
      </div>
    </main>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin mb-4" />
      <p className="text-muted-foreground text-sm">
        Préparation du paiement sécurisé…
      </p>
    </div>
  )
}

function ErrorState({
  message,
  onBack,
}: {
  message: string
  onBack: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-destructive text-3xl mb-3">⚠</div>
      <h1 className="text-xl font-bold mb-2">Paiement impossible</h1>
      <p className="text-muted-foreground text-sm mb-6 max-w-[400px]">
        {message}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center justify-center min-h-[48px] px-6 py-3 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-[#ffc064] transition-colors"
      >
        Retour aux offres
      </button>
    </div>
  )
}

function SuccessState({ plan }: { plan: Plan }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center text-primary text-3xl mb-4">
        ✓
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-3">
        Paiement confirmé !
      </h1>
      <p className="text-muted-foreground text-[15px] leading-relaxed mb-6 max-w-[420px]">
        Merci pour votre achat du <strong className="text-foreground">{plan.name}</strong>.
        Votre accès numérique est en route — vous recevrez un e-mail avec
        le lien de la bibliothèque dans quelques minutes.
      </p>
      <img
        src={plan.image}
        alt={plan.name}
        className="w-full max-w-[220px] mx-auto mb-6 drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
      />
      <a
        href="/"
        className="inline-flex items-center justify-center min-h-[52px] px-8 py-3.5 rounded-lg bg-primary text-primary-foreground font-extrabold hover:bg-[#ffc064] transition-colors no-underline"
      >
        Retour à l&apos;accueil
      </a>
      <p className="text-[12px] text-[#7e848d] mt-6 max-w-[400px]">
        Si vous ne recevez pas l&apos;e-mail sous 10 minutes, vérifiez vos
        courriers indésirables ou contactez le support.
      </p>
    </div>
  )
}

function ProductHeader({ plan }: { plan: Plan }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6 mb-5">
      <div className="flex flex-col xs:flex-row gap-4 items-center xs:items-start text-center xs:text-left">
        <img
          src={plan.image}
          alt={plan.name}
          className="w-[120px] h-[120px] xs:w-[140px] xs:h-[140px] object-contain rounded-lg flex-shrink-0 bg-[#0a0b0d] p-2"
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold leading-snug mb-1">
            {plan.name}
          </h1>
          <p className="text-[13px] sm:text-[14px] text-muted-foreground leading-relaxed mb-3">
            {plan.description}
          </p>
          <div className="text-primary font-extrabold text-2xl sm:text-3xl leading-none">
            {formatPrice(plan.amount, plan.currency)}
          </div>
          <p className="text-[12px] text-[#828790] mt-1.5">
            Paiement unique · Accès à vie · Sans abonnement
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Default export — wraps the inner component in Suspense because
// useSearchParams() requires it in Next.js 16.
// ============================================================
export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutShell><LoadingState /></CheckoutShell>}>
      <CheckoutInner />
    </Suspense>
  )
}
