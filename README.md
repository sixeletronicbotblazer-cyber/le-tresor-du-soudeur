# Le trésor du soudeur

Landing page + Stripe Embedded Checkout for the **Le trésor du soudeur** product —
a marketplace of 4,000+ metalworking plans sold in euros.

Built with Next.js 16 + TypeScript + Tailwind CSS 4. Mobile-first responsive
design, dark welder theme (charcoal + amber accent).

## Features

- **3-plan transparent checkout** (no redirect to checkout.stripe.com):
  - Forfait de base — **9 €** (3000+ plans)
  - Forfait professionnel (upsell popup) — **12 €** (4000+ plans + 4 bonuses)
  - Forfait professionnel — **17 €** (full pack)
- **Upsell popup** — clicking the base-plan CTA opens a recovery popup offering
  the pro plan at a discount. Closeable with X, Esc, or click-outside.
- **Stripe Embedded Checkout** — payment form lives inside our `/checkout` page.
  Card data never touches our server; Stripe handles all PCI scope.
- **Webhook** for payment confirmation (`/api/webhook`) — currently logs, ready
  to wire to your email-delivery system.
- **Mobile-first responsive** — verified at 320 / 360 / 768 / 1440 px widths.
- **Performance tuned**:
  - Hero image preloaded, all images lazy-loaded with `decoding="async"`
  - Stripe.js loaded lazily (only when `/checkout` mounts)
  - Per-plan session cache (re-uses the same Checkout Session on back-button)
  - Long-cache headers for static assets

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, Turbopack)
- [TypeScript 5](https://www.typescriptlang.org/)
- [Tailwind CSS 4](https://tailwindcss.com/) with custom theme
- [Stripe](https://stripe.com/) — server SDK + Stripe.js v10
- [Prisma ORM](https://www.prisma.io/) (SQLite client available, unused by checkout)

## Project structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout, French lang, fonts, preloads
│   ├── page.tsx             # Landing page (hero, pricing, upsell popup, FAQ)
│   ├── globals.css          # Dark welder theme + animations
│   ├── checkout/page.tsx    # Stripe Embedded Checkout page
│   └── api/
│       ├── checkout/route.ts # POST creates Checkout Session (embedded)
│       └── webhook/route.ts  # POST receives Stripe events
├── lib/
│   ├── plans.ts             # Client-safe plan definitions (3 plans)
│   └── stripe.ts            # Server-only Stripe SDK singleton
└── components/ui/           # shadcn/ui component library
public/assets/               # 16 optimized webp images (~420 KB total)
```

## Getting started

### Prerequisites

- Node.js 18+ (or Bun)
- A Stripe account

### Install

```bash
bun install   # or npm install
```

### Configure

Create `.env.local` (gitignored) with:

```env
# Stripe secret key — server-side only, NEVER exposed to the client.
# Use sk_test_... for testing, sk_live_... for production.
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxx

# Stripe publishable key — safe to expose to the client.
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxx

# Webhook signing secret — register the webhook in the Stripe Dashboard.
# URL: https://YOUR_DOMAIN/api/webhook
# Events: checkout.session.completed, checkout.session.expired
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxx

# Public HTTPS URL of your deployed site.
# Used for 3DS return_url and Stripe line-item images.
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### Run

```bash
bun run dev     # start dev server on port 3000
bun run lint    # check code quality
bun run build   # production build
```

## Test cards (Stripe test mode)

Use `sk_test_...`/`pk_test_...` keys and these cards:

| Card number | Behavior |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0027 6000 3184` | Triggers 3DS challenge |
| `4000 0000 0000 9995` | Declines (insufficient funds) |

Use any future expiry date and any 3-digit CVC.

## Security notes

- **Never commit `.env.local`** — it contains your Stripe secret key. The
  `.gitignore` excludes `.env*` by default.
- The Stripe secret key is only ever imported from server code
  (`src/lib/stripe.ts` declares `import 'server-only'`).
- The webhook verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`.
- Card data is collected by Stripe.js inside their iframe — our server never
  sees the card number.

## Deployment

The site is configured for `output: 'standalone'`. Deploy to any Node.js host
(Vercel, Railway, Render, a VPS, etc.).

Required env vars (set in your host's dashboard):
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_BASE_URL` (your production HTTPS URL)

### Deploy on Vercel

1. Push the repo to GitHub (already done — `https://github.com/sixeletronicbotblazer-cyber/le-tresor-du-soudeur`).
2. Go to https://vercel.com/new and import the GitHub repo.
3. **Before clicking "Deploy"**, scroll to "Environment Variables" and add the
   following entries (set each for all three environments: Production,
   Preview, and Development):

   | Name | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_live_...` (or `sk_test_...` for testing) |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (or `pk_test_...`) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` (see step 5 below) |
   | `NEXT_PUBLIC_BASE_URL` | `https://your-vercel-domain.vercel.app` |

   > **The build fails on Vercel if `STRIPE_SECRET_KEY` is missing AT RUNTIME.**
   > The build itself succeeds without env vars (the Stripe SDK is lazily
   > initialized on first API call, not at module import), so the deploy
   > won't error during the build step. But the moment someone hits
   > `/api/checkout`, the API will return a 500 with the message
   > "STRIPE_SECRET_KEY is not set" if the env var isn't set in the Vercel
   > dashboard.

4. Click "Deploy". Vercel will run `bun install && bun run build` — the build
   will succeed even before you set the env vars, because the Stripe client
   is lazy-initialized.

5. After the first deploy, you get a public HTTPS URL like
   `https://le-tresor-du-soudeur-xxx.vercel.app`. Use this URL to:
   - Set `NEXT_PUBLIC_BASE_URL` to this exact URL (redeploy after).
   - Register the webhook in the Stripe Dashboard:
     - Developers → Webhooks → Add endpoint
     - URL: `https://your-vercel-domain.vercel.app/api/webhook`
     - Events: `checkout.session.completed`, `checkout.session.expired`
     - Copy the signing secret (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET`
       in the Vercel dashboard (redeploy after).

6. To redeploy after adding env vars: Vercel dashboard → Project → Deployments →
   click the three dots next to the latest → "Redeploy". Or push any commit to
   `main` and Vercel will rebuild automatically.

### Why the build doesn't fail on Vercel anymore

Earlier builds failed with:
```
Error: STRIPE_SECRET_KEY is not set. Add it to .env.local (server-side only).
Failed to collect page data for /api/checkout
```

This happened because Next.js evaluates route modules during the
"Collecting page data" build step, and env vars are NOT available at build
time — only at runtime. The original code did
`export const stripe = new Stripe(secretKey, ...)` at module scope, which
threw during the build.

The fix: `src/lib/stripe.ts` now exports `stripe` as a lazy Proxy that only
initializes the real Stripe SDK on the first property access (i.e. when a
route handler actually calls `stripe.checkout.sessions.create(...)`). At
build time, no method is called, so no error. At runtime, the env vars
are present and initialization succeeds.

## License

Proprietary — © Le trésor du soudeur
