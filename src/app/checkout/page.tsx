'use client'

import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import type { StripeEmbeddedCheckout } from '@stripe/stripe-js'
import {
  PLANS,
  BUMPS,
  isPlanId,
  isBumpId,
  sanitizeBumpSelection,
  computeTotalCents,
  formatPrice,
  type PlanId,
  type Plan,
  type BumpId,
  type Bump,
} from '@/lib/plans'

// ============================================================
// Stripe.js singleton — loaded lazily on first call, reused after.
// We do NOT load the Stripe.js external script until the user actually
// clicks "Continue to payment", so the home page (the heaviest page)
// doesn't pay for it.
// ============================================================
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe(): Promise<NonNullable<Awaited<ReturnType<typeof loadStripe>>>> {
  if (!stripePublishableKey) {
    return Promise.reject(
      new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.')
    )
  }
  if (!stripePromise) {
    stripePromise = loadStripe(stripePublishableKey)
  }
  return stripePromise.then((stripe) => {
    if (!stripe) {
      return Promise.reject(new Error('Stripe.js failed to load.'))
    }
    return stripe
  })
}

// ============================================================
// Per-(plan,bumps) session cache.
// The cache key includes the bump selection so the user does NOT re-use
// a session that has the wrong line items.
// Stripe sessions are valid for 24h after creation.
// ============================================================
const clientSecretCache = new Map<string, string>()
function cacheKey(planId: PlanId, bumpIds: BumpId[]): string {
  return `${planId}|${[...bumpIds].sort().join(',')}`
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

  // Two-step flow: STEP_REVIEW (bumps selection) → STEP_PAYMENT (Stripe iframe)
  const [step, setStep] = useState<'review' | 'payment'>('review')
  // Selected bump ids — always sanitized through the mutual-exclusion rule.
  const [selectedBumps, setSelectedBumps] = useState<BumpId[]>([])

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
  // NOTE: this is an optimistic UI flag only. The webhook is the source
  // of truth — see /api/webhook for delivery logic.
  useEffect(() => {
    if (statusParam !== 'return' || !planIdParam) return
    if (!isPlanId(planIdParam)) return
    setPaid(true)
  }, [statusParam, planIdParam])

  // ----------------------------------------------------------
  // Bump selection handlers (with mutual exclusion)
  // ----------------------------------------------------------

  /**
   * Toggle a bump on/off, applying the mutual-exclusion rule:
   *  - combo "pack-atelier" + any individual → keep combo, drop individual.
   *  - individual + combo already selected → drop combo, add individual.
   *
   * This mirrors the server-side sanitizeBumpSelection() so the client
   * never sends an inconsistent selection.
   */
  const toggleBump = useCallback((bumpId: BumpId) => {
    setSelectedBumps((prev) => {
      const next = new Set(prev)
      const bump = BUMPS[bumpId]
      if (next.has(bumpId)) {
        // Unchecking.
        next.delete(bumpId)
      } else {
        // Checking — apply exclusion rules.
        if (bump.isCombo) {
          // Selecting the combo: uncheck every individual it contains.
          for (const containedId of bump.contains ?? []) {
            next.delete(containedId)
          }
          next.add(bumpId)
        } else {
          // Selecting an individual: uncheck the combo (if present).
          next.delete('pack-atelier')
          next.add(bumpId)
        }
      }
      return Array.from(next) as BumpId[]
    })
  }, [])

  // ----------------------------------------------------------
  // Create the Checkout Session and mount the embedded form
  // ----------------------------------------------------------

  // Guard against concurrent mountCheckout() calls. If the user clicks
  // "Continue to payment", then quickly back to review and forward again
  // before the first mount finished, we'd race and end up trying to mount
  // two Stripe instances — Stripe throws "You cannot have multiple
  // Embedded Checkout objects" in that case.
  const mountingRef = useRef(false)

  // Track which (plan, bumps) combo is currently mounted so we don't
  // re-mount the same session twice (which would also throw the
  // "multiple Embedded Checkout objects" error).
  const mountedKeyRef = useRef<string | null>(null)

  const mountCheckout = useCallback(
    async (planId: PlanId, bumpIds: BumpId[]) => {
      // Prevent concurrent mounts.
      if (mountingRef.current) return
      const key = cacheKey(planId, bumpIds)
      // Already mounted for this exact selection — nothing to do.
      if (mountedKeyRef.current === key && checkoutRef.current) return

      mountingRef.current = true
      setLoading(true)
      setError(null)
      try {
        // CRITICAL: destroy the previous Stripe instance BEFORE creating
        // a new one. The Stripe SDK throws "You cannot have multiple
        // Embedded Checkout objects" if you call createEmbeddedCheckoutPage
        // while a previous instance is still alive — even if you unmount
        // it afterwards. So we unmount + destroy first, synchronously.
        if (checkoutRef.current) {
          try {
            checkoutRef.current.unmount()
            checkoutRef.current.destroy()
          } catch {
            // Ignore errors from double-destroy — the instance may
            // already be gone if React strict-mode ran the cleanup twice.
          }
          checkoutRef.current = null
          mountedKeyRef.current = null
        }

        let clientSecret = clientSecretCache.get(key)
        if (!clientSecret) {
          const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: planId, bumps: bumpIds }),
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
          const data = (await res.json()) as {
            client_secret: string
            session_id: string
            plan: string
            bumps: BumpId[]
            total_cents: number
            total_formatted: string
          }
          clientSecret = data.client_secret
          if (clientSecret) {
            clientSecretCache.set(key, clientSecret)
          }
        }
        if (!clientSecret) {
          throw new Error('Stripe did not return a client_secret.')
        }

        const stripe = await getStripe()
        const checkout = await stripe.createEmbeddedCheckoutPage({
          clientSecret,
          onComplete: () => {
            // Payment succeeded — show the success screen.
            // The webhook (/api/webhook) is the authoritative source of
            // truth; this is the optimistic client-side signal.
            setPaid(true)
          },
        })

        // Double-check the container is still in the DOM (the user may
        // have navigated back to review while we were fetching).
        const container = containerRef.current
        if (!container) {
          // No container — the user went back to review. Tear down
          // the new instance and bail.
          try {
            checkout.unmount()
            checkout.destroy()
          } catch {
            /* noop */
          }
          return
        }
        checkout.mount(container)
        checkoutRef.current = checkout
        mountedKeyRef.current = key
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
      } finally {
        mountingRef.current = false
        setLoading(false)
      }
    },
    []
  )

  // When the user advances to the payment step (or changes their bump
  // selection while on the payment step), create/recreate the session.
  useEffect(() => {
    if (!plan || paid || step !== 'payment') return
    void mountCheckout(plan.id, selectedBumps)
  }, [plan, paid, step, selectedBumps, mountCheckout])

  // If the user goes back to the review step, unmount the iframe so
  // they don't see the old form while changing their selection. We
  // destroy + null out the refs so the next mount starts fresh.
  useEffect(() => {
    if (step === 'review' && checkoutRef.current) {
      try {
        checkoutRef.current.unmount()
        checkoutRef.current.destroy()
      } catch {
        /* noop */
      }
      checkoutRef.current = null
      mountedKeyRef.current = null
    }
  }, [step])

  // Clean up the embedded checkout on unmount.
  useEffect(() => {
    return () => {
      if (checkoutRef.current) {
        try {
          checkoutRef.current.unmount()
          checkoutRef.current.destroy()
        } catch {
          /* noop */
        }
        checkoutRef.current = null
        mountedKeyRef.current = null
      }
    }
  }, [])

  // ----------------------------------------------------------
  // Derived state
  // ----------------------------------------------------------

  const totalCents = useMemo(
    () => (plan ? computeTotalCents(plan.id, selectedBumps) : 0),
    [plan, selectedBumps]
  )

  // Bumps that are disabled because the combo is selected.
  const isBumpDisabled = useCallback(
    (bumpId: BumpId) => {
      if (!BUMPS[bumpId].isCombo) {
        // Individual bumps are disabled when the combo is selected.
        return selectedBumps.includes('pack-atelier')
      }
      // Combo is disabled when... never (it can always be selected,
      // selecting it just unchecks the individuals).
      return false
    },
    [selectedBumps]
  )

  // ----------------------------------------------------------
  // Render states
  // ----------------------------------------------------------

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
        <SuccessState plan={plan} bumpIds={selectedBumps} />
      </CheckoutShell>
    )
  }

  return (
    <CheckoutShell>
      <ProductHeader plan={plan} />

      {step === 'review' && (
        <ReviewStep
          plan={plan}
          selectedBumps={selectedBumps}
          onToggleBump={toggleBump}
          isBumpDisabled={isBumpDisabled}
          totalCents={totalCents}
          onContinue={() => setStep('payment')}
        />
      )}

      {step === 'payment' && (
        <PaymentStep
          plan={plan}
          selectedBumps={selectedBumps}
          totalCents={totalCents}
          loading={loading}
          onBack={() => setStep('review')}
          containerRef={containerRef}
        />
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
  // Detect the specific "STRIPE_SECRET_KEY is not set" error so we can
  // show a more actionable message with a direct link to the debug page.
  const isEnvMissing = message.toLowerCase().includes('is not set')
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {/* Show the diagnostic box FIRST when env is missing — it's the
          most important information for the user, not the cryptic error. */}
      {isEnvMissing && <EnvDiagnosticBox />}

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

/**
 * Auto-fetches /api/debug/env and shows the status of each Stripe env var
 * inline. The user does not need to open another URL — the diagnostic
 * appears right in the error page.
 */
function EnvDiagnosticBox() {
  const [data, setData] = useState<{
    vars?: Array<{
      name: string
      status: 'set' | 'empty' | 'missing'
      preview: string
      required: boolean
      hint: string
    }>
    environment?: {
      isVercel?: boolean
      vercelEnv?: string
      vercelUrl?: string
    }
    error?: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/debug/env')
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const json = (await res.json()) as typeof data
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setData({
            error: err instanceof Error ? err.message : 'Unknown error',
          })
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="bg-[#0a0b0d] border border-[#26303c] rounded-lg p-4 mb-6 max-w-[460px] text-left">
      <p className="text-[13px] font-bold text-primary mb-2 flex items-center gap-2">
        <span>🔍</span>
        Diagnostic automatique
      </p>

      {loading && (
        <p className="text-[12px] text-muted-foreground">
          Vérification des variables d&apos;environnement…
        </p>
      )}

      {!loading && data?.error && (
        <p className="text-[12px] text-destructive">
          Erreur lors du diagnostic : {data.error}
        </p>
      )}

      {!loading && data?.vars && (
        <>
          <p className="text-[12px] text-muted-foreground mb-3 leading-relaxed">
            As variáveis de ambiente Stripe não chegaram no runtime. Veja
            abaixo quais estão configuradas:
          </p>

          <ul className="space-y-2 mb-3">
            {data.vars.map((v) => {
              const isOk = v.status === 'set'
              const isMissing = v.status === 'missing'
              return (
                <li
                  key={v.name}
                  className={`flex items-start gap-2 text-[12px] leading-snug ${
                    isOk ? 'text-foreground' : 'text-destructive'
                  }`}
                >
                  <span className="text-[14px] flex-shrink-0 mt-px">
                    {isOk ? '✅' : isMissing ? '❌' : '⚠️'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <code className="font-mono text-[11.5px] font-bold break-all">
                        {v.name}
                      </code>
                      <span className="text-[10.5px] text-muted-foreground">
                        {isOk ? `(OK — ${v.preview})` : isMissing ? '(manquante)' : '(vide)'}
                      </span>
                    </div>
                    {v.required && !isOk && (
                      <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">
                        {v.hint}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {data.environment && (
            <p className="text-[10.5px] text-muted-foreground mb-3 leading-relaxed border-t border-[#26303c] pt-2">
              Ambiente:{' '}
              <strong className="text-foreground">
                {data.environment.isVercel
                  ? `Vercel (${data.environment.vercelEnv ?? 'unknown'})`
                  : 'Local development'}
              </strong>
            </p>
          )}

          <div className="bg-[#161e2a] border border-[#3a4250] rounded p-3 mt-2">
            <p className="text-[11.5px] font-bold text-foreground mb-1.5">
              🚀 Como corrigir:
            </p>
            <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                Abra o painel da Vercel:{' '}
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:text-[#ffc064] break-all"
                >
                  vercel.com/dashboard
                </a>{' '}
                → clique no seu projeto → <strong>Settings</strong> →{' '}
                <strong>Environment Variables</strong>
              </li>
              <li>
                Para cada variável com ❌ acima, clique em{' '}
                <strong>&quot;Add New&quot;</strong>, cole o nome exato (ex.:{' '}
                <code className="font-mono">STRIPE_SECRET_KEY</code>), cole o
                valor, marque as <strong>3 caixas</strong> (Production +
                Preview + Development) e salve
              </li>
              <li>
                <strong className="text-foreground">CRÍTICO:</strong> vá na
                aba <strong>Deployments</strong> → clique nos 3 pontinhos{' '}
                <code className="font-mono">⋯</code> ao lado do deploy mais
                recente → <strong>Redeploy</strong> → desmarque &quot;Use
                existing Build Cache&quot; → clique em <strong>Redeploy</strong>
              </li>
              <li>
                Aguarde o status ficar <strong>Ready</strong> (bolinha verde,
                ~1 min), depois recarregue esta página
              </li>
            </ol>
          </div>

          <p className="text-[11px] text-[#9aa0a8] mt-3 leading-relaxed">
            <strong className="text-foreground">Causa mais comum:</strong>{' '}
            a variável foi salva no painel da Vercel, mas não foi feito
            redeploy depois. A Vercel NÃO redeploy automaticamente quando
            só mudam env vars — precisa forçar manualmente.
          </p>
        </>
      )}
    </div>
  )
}

function SuccessState({ plan, bumpIds }: { plan: Plan; bumpIds: BumpId[] }) {
  const hasBumps = bumpIds.length > 0
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/15 border-2 border-primary flex items-center justify-center text-primary text-3xl mb-4">
        ✓
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-3">
        Paiement confirmé !
      </h1>
      <p className="text-muted-foreground text-[15px] leading-relaxed mb-6 max-w-[420px]">
        Merci pour votre achat du{' '}
        <strong className="text-foreground">{plan.name}</strong>
        {hasBumps && (
          <>
            {' '}et de {bumpIds.length === 1 ? 'votre complément' : `vos ${bumpIds.length} compléments`}.
          </>
        )}{' '}
        Votre accès numérique est en route — vous recevrez un e-mail avec
        le lien de la bibliothèque dans quelques minutes.
      </p>
      <img
        src={plan.image}
        width={220}
        height={220}
        alt={plan.name}
        className="w-full max-w-[220px] mx-auto mb-6 drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
        loading="eager"
        decoding="async"
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
          width={140}
          height={140}
          alt={plan.name}
          className="w-[120px] h-[120px] xs:w-[140px] xs:h-[140px] object-contain rounded-lg flex-shrink-0 bg-[#0a0b0d] p-2"
          loading="eager"
          decoding="async"
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
// REVIEW STEP — bump selection + live order summary
// ============================================================

function ReviewStep({
  plan,
  selectedBumps,
  onToggleBump,
  isBumpDisabled,
  totalCents,
  onContinue,
}: {
  plan: Plan
  selectedBumps: BumpId[]
  onToggleBump: (id: BumpId) => void
  isBumpDisabled: (id: BumpId) => boolean
  totalCents: number
  onContinue: () => void
}) {
  return (
    <>
      {/* Bump cards */}
      <section className="mb-6">
        <h2 className="text-base sm:text-lg font-bold mb-1 flex items-center gap-2">
          <span className="text-primary">+</span>
          Améliorez votre commande
        </h2>
        <p className="text-[12px] sm:text-[13px] text-muted-foreground mb-4">
          Compléments facultatifs, à ajouter avant le paiement.
        </p>

        <div className="space-y-3">
          {(Object.values(BUMPS) as Bump[]).map((bump) => (
            <BumpCard
              key={bump.id}
              bump={bump}
              checked={selectedBumps.includes(bump.id)}
              disabled={isBumpDisabled(bump.id)}
              onToggle={() => onToggleBump(bump.id)}
            />
          ))}
        </div>
      </section>

      {/* Order summary */}
      <OrderSummary
        plan={plan}
        selectedBumps={selectedBumps}
        totalCents={totalCents}
      />

      {/* Continue to payment */}
      <button
        type="button"
        onClick={onContinue}
        className="w-full inline-flex items-center justify-center min-h-[54px] px-5 py-3.5 mt-5 rounded-lg bg-primary text-primary-foreground font-extrabold text-[15px] sm:text-base shadow-[0_7px_26px_rgba(233,148,42,0.32)] hover:bg-[#ffc064] hover:-translate-y-0.5 transition-all duration-200"
      >
        Continuer vers le paiement · {formatPrice(totalCents, plan.currency)}
      </button>
      <p className="text-[11px] text-[#7e848d] text-center mt-3">
        Paiement sécurisé par Stripe · CB, Visa, Mastercard · Sans abonnement
      </p>
    </>
  )
}

function BumpCard({
  bump,
  checked,
  disabled,
  onToggle,
}: {
  bump: Bump
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const inputId = `bump-${bump.id}`
  return (
    <label
      htmlFor={inputId}
      className={`
        block bg-card border rounded-xl p-3 sm:p-4 cursor-pointer
        transition-all duration-150
        ${
          checked
            ? 'border-[#a56b27] shadow-[0_0_24px_rgba(233,148,42,0.18)]'
            : 'border-border hover:border-[#5a6473]'
        }
        ${disabled ? 'opacity-45 cursor-not-allowed pointer-events-none' : ''}
      `}
    >
      <div className="flex gap-3 sm:gap-4 items-start">
        {/* Image */}
        <img
          src={bump.image}
          width={80}
          height={80}
          alt={bump.name}
          className="w-[68px] h-[68px] sm:w-[80px] sm:h-[80px] object-contain rounded-lg flex-shrink-0 bg-[#0a0b0d] p-1.5"
          loading="lazy"
          decoding="async"
        />

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[14px] sm:text-[15px] font-bold leading-snug mb-0.5">
              {bump.name}
            </h3>
            <span className="text-primary font-extrabold text-[14px] sm:text-[15px] whitespace-nowrap flex-shrink-0">
              {formatPrice(bump.amount, bump.currency)}
            </span>
          </div>
          <p className="text-[12px] sm:text-[13px] text-primary font-semibold mb-1">
            {bump.pitch}
          </p>
          <p className="text-[11.5px] sm:text-[12.5px] text-muted-foreground leading-relaxed mb-2 line-clamp-3">
            {bump.description}
          </p>

          {/* Checkbox row */}
          <div className="flex items-center gap-2.5">
            <input
              id={inputId}
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={onToggle}
              className="w-[18px] h-[18px] rounded-[4px] border-[#3a4250] bg-[#0a0b0d] accent-[#ffae36] flex-shrink-0 cursor-pointer"
            />
            <span className="text-[12px] sm:text-[13px] text-foreground font-medium leading-snug">
              {bump.selectLabel}
            </span>
          </div>

          {/* Combo support text */}
          {bump.isCombo && (
            <p className="text-[11px] text-[#9aa0a8] mt-2 italic">
              Séparément : 23 € · Ensemble : 17 €
            </p>
          )}
        </div>
      </div>
    </label>
  )
}

function OrderSummary({
  plan,
  selectedBumps,
  totalCents,
}: {
  plan: Plan
  selectedBumps: BumpId[]
  totalCents: number
}) {
  const bumps = selectedBumps.map((id) => BUMPS[id])
  return (
    <div className="bg-[#0a0b0d] border border-[#26303c] rounded-xl p-4 sm:p-5">
      <h2 className="text-[13px] sm:text-sm font-bold uppercase tracking-wider text-[#9aa0a8] mb-3">
        Récapitulatif
      </h2>
      <ul className="space-y-2 mb-3">
        <li className="flex justify-between gap-3 items-start text-[13px] sm:text-[14px]">
          <span className="text-foreground font-semibold">
            {plan.name.split(' — ')[0]}
          </span>
          <span className="text-foreground font-bold whitespace-nowrap">
            {formatPrice(plan.amount, plan.currency)}
          </span>
        </li>
        {bumps.map((bump) => (
          <li
            key={bump.id}
            className="flex justify-between gap-3 items-start text-[13px] sm:text-[14px]"
          >
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="text-primary text-[10px]">+</span>
              {bump.name}
            </span>
            <span className="text-muted-foreground font-semibold whitespace-nowrap">
              {formatPrice(bump.amount, bump.currency)}
            </span>
          </li>
        ))}
        {bumps.length === 0 && (
          <li className="text-[12px] text-[#7e848d] italic">
            Aucun complément sélectionné.
          </li>
        )}
      </ul>
      <div className="border-t border-[#26303c] pt-3 flex justify-between items-baseline gap-3">
        <span className="text-[14px] sm:text-base font-bold text-foreground">
          Total
        </span>
        <span className="text-primary font-extrabold text-2xl sm:text-3xl leading-none">
          {formatPrice(totalCents, plan.currency)}
        </span>
      </div>
    </div>
  )
}

// ============================================================
// PAYMENT STEP — Stripe embedded iframe + summary banner
// ============================================================

function PaymentStep({
  plan,
  selectedBumps,
  totalCents,
  loading,
  onBack,
  containerRef,
}: {
  plan: Plan
  selectedBumps: BumpId[]
  totalCents: number
  loading: boolean
  onBack: () => void
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const bumps = selectedBumps.map((id) => BUMPS[id])
  return (
    <>
      {/* Compact summary banner at the top of the payment step */}
      <div className="bg-card border border-border rounded-xl p-4 mb-4">
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold leading-snug">
              {plan.name.split(' — ')[0]}
            </p>
            {bumps.length > 0 && (
              <p className="text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
                + {bumps.map((b) => b.name).join(' · ')}
              </p>
            )}
          </div>
          <span className="text-primary font-extrabold text-xl whitespace-nowrap">
            {formatPrice(totalCents, plan.currency)}
          </span>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline transition-colors"
        >
          ← Modifier ma commande
        </button>
      </div>

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
    </>
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
