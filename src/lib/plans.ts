/**
 * Plan + bump definitions — client-safe.
 *
 * This module is imported by both the client (/checkout page) and the
 * server (API routes), so it MUST NOT import the Stripe SDK or any
 * server-only code. The Stripe client lives in src/lib/stripe.ts.
 *
 * Main plans: 3 (base 9 €, upsell 12 € recovery offer, pro 17 €).
 * Optional order bumps: 4 (3 individual guides at 7-9 € + 1 combo at 17 €).
 *
 * Mutual-exclusion rule (single source of truth — used by both the
 * client UI and the server validation):
 *   - The combo "Pack Atelier Rentable" contains the three individual
 *     guides, so it cannot be ordered together with any of them.
 *   - Selecting the combo → disable + uncheck the three individuals.
 *   - Selecting any individual → uncheck the combo.
 *
 * Images:
 *   The 4 bump images are commercial covers (mockups), NOT the digital
 *   files themselves. They are stored as /assets/bump-*.webp and are
 *   only used to illustrate the product in the checkout UI. The actual
 *   digital files (PDF guides) must be hosted separately and are NOT
 *   included in this codebase.
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

// ============================================================
// ORDER BUMPS
// ============================================================

export type BumpId = 'carnet-devis' | 'finitions-metal' | 'plan-coupe' | 'pack-atelier'

export interface Bump {
  id: BumpId
  name: string
  /** Short pitch shown under the name on the card. */
  pitch: string
  /** Long-form description shown on the card. */
  description: string
  amount: number // cents — 7 € = 700
  image: string
  currency: 'eur'
  /** Label shown next to the checkbox. */
  selectLabel: string
  /** Is this the combo that contains the three individual bumps? */
  isCombo: boolean
  /** If isCombo, list the individual bumps it contains. */
  contains?: BumpId[]
}

export const BUMPS: Record<BumpId, Bump> = {
  'carnet-devis': {
    id: 'carnet-devis',
    name: 'Carnet des devis rentables',
    pitch: 'Des devis mieux calculés pour protéger votre marge.',
    description:
      "Apprenez à construire vos devis de métallerie en tenant compte des matériaux, de la main-d’œuvre, des frais de l’atelier et de la marge souhaitée. Une méthode pratique pour organiser vos prestations et éviter de fixer un prix au hasard.",
    amount: 700, // 7 €
    image: '/assets/bump-carnet-devis.webp',
    currency: 'eur',
    selectLabel: 'Oui, ajouter le Carnet des devis rentables pour 7 €.',
    isCombo: false,
  },
  'finitions-metal': {
    id: 'finitions-metal',
    name: 'Finitions Métal Pro',
    pitch: 'Des pièces en métal mieux préparées et mieux finies.',
    description:
      "Découvrez les étapes de préparation, nettoyage, protection et peinture du métal pour présenter des pièces au rendu plus soigné. Un guide pratique pour choisir une finition adaptée au projet et améliorer la qualité perçue de vos ouvrages.",
    amount: 700, // 7 €
    image: '/assets/bump-finitions-metal.webp',
    currency: 'eur',
    selectLabel: 'Oui, ajouter Finitions Métal Pro pour 7 €.',
    isCombo: false,
  },
  'plan-coupe': {
    id: 'plan-coupe',
    name: 'Plan de coupe anti-chutes',
    pitch: 'Planifiez vos découpes et réduisez les chutes d’acier.',
    description:
      "Organisez les longueurs à découper avant d’acheter vos barres. Apprenez à regrouper les pièces par profilé, à estimer les barres nécessaires et à réutiliser les chutes quand c’est possible, afin de mieux maîtriser le coût des matériaux.",
    amount: 900, // 9 €
    image: '/assets/bump-plan-coupe.webp',
    currency: 'eur',
    selectLabel: 'Oui, ajouter le Plan de coupe anti-chutes pour 9 €.',
    isCombo: false,
  },
  'pack-atelier': {
    id: 'pack-atelier',
    name: 'Pack Atelier Rentable',
    pitch: 'Les trois compléments réunis dans un seul pack.',
    description:
      "Réunissez le Carnet des devis rentables, Finitions Métal Pro et le Plan de coupe anti-chutes. Trois ressources complémentaires pour mieux chiffrer vos projets, soigner vos finitions et prévoir vos découpes.",
    amount: 1700, // 17 €
    image: '/assets/bump-pack-atelier.webp',
    currency: 'eur',
    selectLabel: 'Oui, je prends les trois compléments pour 17 €.',
    isCombo: true,
    contains: ['carnet-devis', 'finitions-metal', 'plan-coupe'],
  },
}

export function isBumpId(value: string | null | undefined): value is BumpId {
  return (
    value === 'carnet-devis' ||
    value === 'finitions-metal' ||
    value === 'plan-coupe' ||
    value === 'pack-atelier'
  )
}

/**
 * Validate a selection of bumps against the mutual-exclusion rule.
 *
 * Rule: the combo "Pack Atelier Rentable" cannot be combined with any of
 * the individual bumps it contains. Returns a sanitized, deduplicated
 * array of bump ids that respect the rule.
 *
 * Strategy:
 *  - If the combo is present, drop any individual bump it contains.
 *  - If an individual bump is present, the combo cannot be present.
 *    (We resolve this by preferring the combo when both are present,
 *     because the combo is cheaper than the sum of the three.)
 *
 * The server calls this on the body sent by the browser — the client
 * is never trusted to send arbitrary bump combinations or amounts.
 */
export function sanitizeBumpSelection(input: unknown): BumpId[] {
  if (!Array.isArray(input)) return []
  const ids = input.filter(isBumpId)
  if (ids.length === 0) return []
  // Deduplicate while preserving order.
  const seen = new Set<BumpId>()
  const unique: BumpId[] = []
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      unique.push(id)
    }
  }
  // Apply mutual exclusion.
  const hasCombo = unique.includes('pack-atelier')
  if (hasCombo) {
    // Drop every individual bump that the combo contains.
    const comboContents = new Set(BUMPS['pack-atelier'].contains ?? [])
    return unique.filter((id) => !comboContents.has(id))
  }
  return unique
}

/**
 * Compute the total amount in cents for a plan + selected bumps.
 * Pure function — used by both client (live preview) and server (validation).
 */
export function computeTotalCents(planId: PlanId, bumpIds: BumpId[]): number {
  let total = PLANS[planId].amount
  for (const bumpId of bumpIds) {
    total += BUMPS[bumpId].amount
  }
  return total
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

/**
 * Format an amount in cents as a French-euro price string.
 * Pure helper, shared between client + server.
 *   formatPrice(900, 'eur')  →  "9,00 €"
 *   formatPrice(1700, 'eur')  →  "17,00 €"
 */
export function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}
