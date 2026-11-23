/**
 * Plan definitions — client-safe.
 *
 * This module is imported by both the client (/checkout page) and the
 * server (API routes), so it MUST NOT import the Stripe SDK or any
 * server-only code. The Stripe client lives in src/lib/stripe.ts.
 *
 * Each plan declares:
 *  - id:           the query-string value used to select it
 *  - name:         product name shown in the Stripe Checkout summary
 *  - description:  product description
 *  - amount:       amount in the smallest currency unit (cents)
 *  - image:        local asset path under /public/assets (used on our own
 *                  /checkout page header — NOT passed to Stripe, because
 *                  Stripe requires public HTTPS URLs for line-item images
 *                  and the dev sandbox does not have a public domain.
 *                  Replace NEXT_PUBLIC_BASE_URL with your production
 *                  domain to enable line-item images too.)
 *  - currency:     EUR (all three plans are sold in euros)
 *  - mode:         'payment' for one-time purchases (no subscription)
 */
export type PlanId = 'base' | 'upsell' | 'pro'

export interface Plan {
  id: PlanId
  name: string
  description: string
  amount: number // cents — 9 € = 900
  image: string
  currency: 'eur'
  mode: 'payment'
}

export const PLANS: Record<PlanId, Plan> = {
  base: {
    id: 'base',
    name: 'Forfait de base — Le trésor du soudeur',
    description:
      'Plus de 3 000 plans de métallerie sélectionnés. Cotes, coupes, listes de matériaux. Accès numérique immédiat et à vie.',
    amount: 900, // 9 €
    image: '/assets/pack-base.webp',
    currency: 'eur',
    mode: 'payment',
  },
  upsell: {
    id: 'upsell',
    name: 'Forfait professionnel — Offre spéciale 12 €',
    description:
      "Plus de 4 000 plans de métallerie complets + 4 bonus offerts (Guide tubes d'acier, Guide des prix, Erreurs des soudeurs, Types d'acier). Accès numérique immédiat et à vie.",
    amount: 1200, // 12 €
    image: '/assets/pack-pro.webp',
    currency: 'eur',
    mode: 'payment',
  },
  pro: {
    id: 'pro',
    name: 'Forfait professionnel — Le trésor du soudeur',
    description:
      "Plus de 4 000 plans de métallerie complets + 4 bonus offerts. Cotes, coupes, matériaux, coûts et prix conseillé. Accès numérique immédiat et à vie.",
    amount: 1700, // 17 €
    image: '/assets/pack-pro.webp',
    currency: 'eur',
    mode: 'payment',
  },
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return value === 'base' || value === 'upsell' || value === 'pro'
}

/**
 * Build the absolute public URL for a local asset. Used to pass product
 * images to Stripe Checkout — Stripe can only fetch HTTPS URLs, so the
 * site must be deployed under a real domain (NEXT_PUBLIC_BASE_URL).
 *
 * Returns null if NEXT_PUBLIC_BASE_URL is not set, in which case the
 * /checkout route simply omits the image from the line item.
 */
export function getPublicAssetUrl(assetPath: string): string | null {
  const base = process.env.NEXT_PUBLIC_BASE_URL
  if (!base) return null
  // Strip trailing slash from base, ensure leading slash on asset path
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`
  return `${cleanBase}${cleanPath}`
}
