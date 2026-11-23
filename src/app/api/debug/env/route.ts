import { NextResponse } from 'next/server'

/**
 * GET /api/debug/env
 *
 * Diagnóstico de configuração do Stripe para deploy Vercel.
 *
 * Mostra, SEM expor valores reais:
 *   - quais variáveis de ambiente Stripe estão presentes
 *   - se cada uma está vazia ou tem conteúdo
 *   - o ambiente (Vercel? Production? Preview? Development?)
 *   - a URL pública base configurada
 *
 * Use este endpoint quando o checkout mostrar:
 *   "Failed to create Stripe Checkout session. STRIPE_SECRET_KEY is not set."
 *
 * Como acessar:
 *   https://SEU_DOMINIO.vercel.app/api/debug/env
 *
 * Se a resposta mostrar "present: false" para STRIPE_SECRET_KEY, significa
 * que a variável não foi salva no painel da Vercel OU não foi feito
 * redeploy depois de salvá-la.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Helper: returns "set" if value exists and is non-empty, "empty" if exists
// but empty string, "missing" if undefined. Never returns the actual value.
function statusOf(value: string | undefined): 'set' | 'empty' | 'missing' {
  if (value === undefined) return 'missing'
  if (value === '') return 'empty'
  return 'set'
}

// Helper: shows only the first 8 chars + last 4 chars (for sanity check
// that the user pasted the right key, e.g. "sk_live_…w8Rf")
function mask(value: string | undefined): string {
  if (!value) return ''
  if (value.length < 16) return '••••'
  return `${value.slice(0, 8)}…${value.slice(-4)}`
}

export async function GET() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  // Detect Vercel environment
  const isVercel = Boolean(process.env.VERCEL)
  const vercelEnv = process.env.VERCEL_ENV ?? '(not on Vercel)'
  const vercelUrl = process.env.VERCEL_URL ?? '(none)'
  const vercelGitCommitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? '(none)'

  const checks = [
    {
      name: 'STRIPE_SECRET_KEY',
      required: true,
      status: statusOf(secretKey),
      preview: mask(secretKey),
      hint: 'Stripe secret key (sk_live_... or sk_test_...). Required for /api/checkout to create Checkout Sessions.',
    },
    {
      name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      required: true,
      status: statusOf(publishableKey),
      preview: mask(publishableKey),
      hint: 'Stripe publishable key (pk_live_... or pk_test_...). Required by /checkout page to load Stripe.js.',
    },
    {
      name: 'STRIPE_WEBHOOK_SECRET',
      required: false,
      status: statusOf(webhookSecret),
      preview: mask(webhookSecret),
      hint: 'Webhook signing secret (whsec_...). Optional until you register the webhook in Stripe Dashboard.',
    },
    {
      name: 'NEXT_PUBLIC_BASE_URL',
      required: true,
      status: statusOf(baseUrl),
      preview: baseUrl || '',
      hint: 'Public HTTPS URL of your deployed site. Used for Stripe 3DS return_url and line-item images.',
    },
  ]

  const allRequiredPresent = checks
    .filter((c) => c.required)
    .every((c) => c.status === 'set')

  return NextResponse.json({
    ok: allRequiredPresent,
    message: allRequiredPresent
      ? 'All required Stripe env vars are present. Checkout should work.'
      : 'Some required Stripe env vars are MISSING. The checkout will fail with "STRIPE_SECRET_KEY is not set" until you add them in the Vercel dashboard AND redeploy.',
    environment: {
      isVercel,
      vercelEnv,
      vercelUrl,
      vercelGitCommitSha: vercelGitCommitSha.slice(0, 8),
      nodeEnv: process.env.NODE_ENV ?? '(unset)',
    },
    vars: checks,
    nextStepsIfFailing: [
      '1. Go to https://vercel.com/[your-project]/settings/environment-variables',
      '2. For each var with status=missing or empty, click "Add New" and enter the name + value',
      '3. Tick ALL THREE environment checkboxes (Production, Preview, Development)',
      '4. Click "Save"',
      '5. Go to Deployments tab → click ⋯ next to latest deploy → "Redeploy"',
      '6. Wait for status "Ready" (green), then refresh this endpoint to confirm all status=set',
    ],
  })
}
