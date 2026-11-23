'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================
// CHECKOUT ROUTES
// ============================================================
// All three purchase paths go to our own /checkout page, which uses the
// Stripe Embedded Checkout (no redirect to checkout.stripe.com).
// The plan id is matched against the canonical PLANS table in
// src/lib/stripe.ts so the price + product info can never drift.
const CHECKOUT_ROUTES = {
  base: '/checkout?plan=base', // Forfait de base 9 €
  upsell: '/checkout?plan=upsell', // Forfait professionnel — popup offer 12 €
  pro: '/checkout?plan=pro', // Forfait professionnel 17 €
} as const

// Support email — leave empty to show a generic message instead.
const CONFIG = {
  supportEmail: '',
}

// ============================================================
// DATA
// ============================================================
const PROBLEM_CARDS = [
  {
    icon: '✎',
    title: "Des heures perdues à dessiner des plans",
    text:
      "Vous passez des heures à dessiner des plans de zéro, sur papier ou sur ordinateur, alors que vous pourriez déjà découper et souder.",
  },
  {
    icon: '⌁',
    title: "Des erreurs de cote qui coûtent cher",
    text:
      "Une seule mauvaise cote vous coûte du matériau, du temps et du bénéfice. Et vous devez racheter de l'acier.",
  },
  {
    icon: '▣',
    title: 'Fixer vos prix au hasard vous fait perdre de l’argent',
    text:
      "Sans connaître le coût réel ni le bon prix de vente, vous facturez trop peu et il ne vous reste presque aucun bénéfice.",
  },
  {
    icon: '◌',
    title: 'Des devis trop lents qui vous font perdre des clients',
    text:
      "Pendant que vous dessinez encore, le client est déjà parti chez un concurrent qui a pu lui montrer un modèle tout de suite.",
  },
]

const FEATURES = [
  { icon: '⌁', label: 'Cotes précises de chaque pièce' },
  { icon: '⬡', label: 'Liste complète des matériaux' },
  { icon: '✂', label: 'Schéma de coupe détaillé' },
  { icon: '▤', label: 'Type et épaisseur de profilé recommandés' },
  { icon: '☷', label: 'Étapes de fabrication dans l’ordre' },
  { icon: '€', label: 'Coût moyen de fabrication' },
  { icon: '◈', label: 'Prix de vente conseillé' },
  { icon: '↗', label: 'Bénéfice estimé par pièce' },
]

const BONUSES = [
  {
    img: '/assets/bonus1.webp',
    alt: 'Guide de présentation du mobilier en tubes d’acier',
    label: 'Bonus 1',
    title: 'Guide de présentation du mobilier en tubes d’acier',
  },
  {
    img: '/assets/bonus2.webp',
    alt: 'Guide complet des prix du mobilier industriel',
    label: 'Bonus 2',
    title: 'Guide complet des prix du mobilier industriel',
  },
  {
    img: '/assets/bonus3.webp',
    alt: 'Les 10 plus grandes erreurs des soudeurs débutants',
    label: 'Bonus 3',
    title: 'Les 10 plus grandes erreurs des soudeurs débutants',
  },
  {
    img: '/assets/bonus4.webp',
    alt: 'Les types d’acier et leurs utilisations',
    label: 'Bonus 4',
    title: 'Les types d’acier et leurs utilisations',
  },
]

const BENEFITS = [
  {
    icon: '◷',
    title: 'Fabriquez beaucoup plus vite',
    text:
      "Ouvrez le plan, relevez les cotes, découpez et assemblez. Sans perdre de temps à réfléchir ou à dessiner.",
  },
  {
    icon: '▣',
    title: 'Fixez vos prix en toute confiance',
    text:
      "Coût des matériaux, prix conseillé et bénéfice estimé : tout est indiqué pour chaque plan. Fini les prix au hasard.",
  },
  {
    icon: '▱',
    title: 'Gardez votre atelier organisé',
    text:
      "Plus de 4 000 plans classés par catégorie : portails, mobilier, remorques, structures et bien plus.",
  },
  {
    icon: '↗',
    title: "Plus d'idées à vendre",
    text:
      "Montrez un modèle fini au client et concluez la vente sur place, sans le faire attendre.",
  },
]

const PRO_PLAN_FEATURES = [
  'Plus de 4 000 plans de métallerie complets',
  '300 plans de portails et de grilles de protection',
  'Plans de petites et grandes remorques',
  'Plans de plateaux et de remorques',
  'Plans automobiles et de carrosserie',
  '600 plans de mobilier industriel',
  '500 plans de structures métalliques et d’abris',
  '50 plans de grills et de barbecues',
  '100 plans d’équipements de musculation',
  'Cotes, coupes, matériaux, coût et prix conseillé',
  'Bonus 1 : Guide de présentation du mobilier en tubes d’acier',
  'Bonus 2 : Guide complet des prix du mobilier industriel',
  'Bonus 3 : Les 10 plus grandes erreurs des soudeurs débutants',
  'Bonus 4 : Les types d’acier et leurs utilisations',
  'Accès numérique immédiat et à vie',
]

const BASE_PLAN_FEATURES = [
  'Plus de 3 000 plans de métallerie sélectionnés',
  'Plans de portails et de grilles de protection',
  'Plans de petites et grandes remorques',
  'Plans de plateaux et de remorques',
  'Plans de mobilier industriel',
  'Plans de structures métalliques',
  'Cotes, coupes et listes de matériaux',
  'Accès numérique immédiat et à vie',
]

const FAQS = [
  {
    q: 'Comment vais-je recevoir les plans ?',
    a: "Dès que votre paiement est confirmé, nous vous envoyons par e-mail l'accès au pack Le trésor du soudeur. Ouvrez-le sur votre téléphone ou votre ordinateur pour consulter ou enregistrer n'importe quel plan quand vous le souhaitez.",
  },
  {
    q: 'Quand vais-je recevoir mon accès ?',
    a: "L'accès est immédiat. Quelques minutes après le paiement, vous recevez un e-mail avec le lien vers la bibliothèque de plus de 4 000 plans.",
  },
  {
    q: 'Faut-il être un métallier expérimenté ?',
    a: "Non. Les plans comprennent les cotes précises, les schémas de coupe, les listes de matériaux et les étapes de fabrication. Si vous savez souder et découper le métal, vous pouvez suivre les plans du pack.",
  },
  {
    q: 'Les coûts et les prix correspondent-ils à ma région ?',
    a: "Oui. Le pack indique un prix de vente conseillé et un bénéfice estimé à titre de référence. Avec le calculateur automatique de prix de l'application, vous pouvez adapter les chiffres aux prix locaux des matériaux et établir vos devis en toute confiance.",
  },
  {
    q: "Je n'ai pas reçu l'e-mail d'accès. Que faire ?",
    a: "Vérifiez votre boîte de réception, vos courriers indésirables et l'onglet Promotions. Si l'e-mail n'est pas arrivé après 10 minutes, écrivez à notre adresse de support et nous vous donnerons accès manuellement.",
  },
  {
    q: 'Est-ce un paiement unique ou un abonnement ?',
    a: "C'est un paiement unique. Vous payez une fois et gardez l'accès aux plans et aux bonus à vie. Sans abonnement ni prélèvements récurrents.",
  },
]

const GALLERY_ROW_1 = [
  { src: '/assets/p1.webp', alt: 'Bibliothèque industrielle' },
  { src: '/assets/p8.webp', alt: 'Portails en acier' },
  { src: '/assets/p3.webp', alt: 'Lit en acier' },
  { src: '/assets/p6.webp', alt: 'Table industrielle' },
  { src: '/assets/p9.webp', alt: 'Tabouret industriel' },
  { src: '/assets/p4.webp', alt: 'Meuble TV industriel' },
]

const GALLERY_ROW_2 = [
  { src: '/assets/p2.webp', alt: 'Cadre de lit' },
  { src: '/assets/p5.webp', alt: 'Barre de traction' },
  { src: '/assets/p10.webp', alt: 'Barbecue en acier' },
  { src: '/assets/p7.webp', alt: 'Chaise en acier' },
  { src: '/assets/p3.webp', alt: 'Lit en acier' },
  { src: '/assets/p4.webp', alt: 'Meuble TV' },
]

const GALLERY_ROW_3 = [
  { src: '/assets/p8.webp', alt: 'Portails' },
  { src: '/assets/p7.webp', alt: 'Chaise' },
  { src: '/assets/p4.webp', alt: 'Meuble TV' },
  { src: '/assets/p6.webp', alt: 'Table' },
  { src: '/assets/p9.webp', alt: 'Tabouret' },
  { src: '/assets/p2.webp', alt: 'Cadre de lit' },
]

// Upsell popup content (Forfait professionnel offer at 12 €)
const UPSELL_TITLE = 'Attendez ! Ne fermez pas encore cette fenêtre…'
const UPSELL_SUBTITLE =
  'Ajoutez plus de 1 000 plans supplémentaires et les 4 bonus offerts avec le forfait professionnel.'
const UPSELL_OLD_PRICE_LABEL = 'Au lieu de 17 € sur la page'
const UPSELL_PRICE = '12 €'
const UPSELL_PRICE_NOTE = 'Paiement unique · Accès à vie'
const UPSELL_FEATURES = [
  'Plus de 4 000 plans de métallerie au total',
  'Cotes, coupes, matériaux, coûts et prix conseillé',
  'Bonus 1 : Guide de présentation du mobilier en tubes d’acier',
  'Bonus 2 : Guide complet des prix du mobilier industriel',
  'Bonus 3 : Les 10 plus grandes erreurs des soudeurs débutants',
  'Bonus 4 : Les types d’acier et leurs utilisations',
  'Accès numérique immédiat et à vie',
]
const UPSELL_CONFIRM_LABEL = 'Oui ! Je veux le pack complet pour 12 €'
const UPSELL_DECLINE_LABEL = 'Non, continuer avec le forfait de base à 9 €'

// ============================================================
// COMPONENTS
// ============================================================

function Ribbon() {
  return (
    <div className="bg-[#792126] text-center text-white text-[12px] sm:text-[13px] font-bold px-3 py-2.5">
      Plus de 4 000 plans de métallerie · Accès numérique
    </div>
  )
}

function CTAButton({
  children,
  href = '#packs',
  variant = 'primary',
  className = '',
  onClick,
}: {
  children: React.ReactNode
  href?: string
  variant?: 'primary' | 'block'
  className?: string
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  const base =
    'inline-flex items-center justify-center min-h-[52px] sm:min-h-[56px] px-6 sm:px-8 py-3.5 rounded-lg font-extrabold text-base sm:text-[17px] no-underline transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-white focus-visible:outline-offset-2'
  const styles =
    variant === 'block'
      ? 'w-full bg-primary text-primary-foreground shadow-[0_7px_26px_rgba(233,148,42,0.28)] hover:bg-[#ffc064]'
      : 'bg-primary text-primary-foreground shadow-[0_7px_26px_rgba(233,148,42,0.28)] hover:bg-[#ffc064]'
  return (
    <a
      href={href}
      onClick={onClick}
      className={`${base} ${styles} ${className}`}
    >
      {children}
    </a>
  )
}

function SectionHeading({
  eyebrow,
  title,
  lead,
  className = '',
}: {
  eyebrow?: string
  title: string
  lead?: string
  className?: string
}) {
  return (
    <div className={`text-center ${className}`}>
      {eyebrow && (
        <div className="text-accent uppercase tracking-[0.15em] text-[11px] sm:text-xs font-extrabold mb-2">
          {eyebrow}
        </div>
      )}
      <h2 className="text-[27px] sm:text-[32px] md:text-[38px] leading-[1.15] tracking-[-0.035em] text-primary font-bold m-0">
        {title}
      </h2>
      {lead && (
        <p className="text-muted-foreground leading-relaxed mt-3 mx-auto mb-0 max-w-[680px] text-[15px] sm:text-base px-2">
          {lead}
        </p>
      )}
    </div>
  )
}

function Hero() {
  return (
    <section className="py-12 sm:py-14 lg:py-[52px] px-4 sm:px-5 text-center">
      <div className="w-full max-w-[1050px] mx-auto">
        <h1 className="text-[38px] xs:text-[44px] sm:text-[56px] md:text-[64px] lg:text-[68px] leading-[1.02] tracking-[-0.055em] text-primary font-bold mt-0 mb-4 sm:mb-5">
          Le trésor du soudeur
        </h1>
        <p className="text-[17px] sm:text-[20px] md:text-[23px] leading-[1.45] font-bold max-w-[730px] mx-auto mb-3 sm:mb-4 text-foreground">
          Plus de 4 000 plans de métallerie prêts à{' '}
          <strong className="text-primary font-bold">
            ouvrir, relever les cotes, fabriquer et vendre
          </strong>
        </p>
        <p className="text-[13px] sm:text-sm text-[#9b9da3] m-0">
          Portails · Mobilier industriel · Remorques · Structures métalliques ·
          Abris et bien plus
        </p>
        <img
          src="/assets/pack-pro.webp"
          width={1100}
          height={1100}
          alt="Collection de plans de métallerie Le trésor du soudeur"
          className="w-full max-w-[420px] xs:max-w-[480px] sm:max-w-[560px] md:max-w-[630px] mx-auto my-4 sm:my-[15px] drop-shadow-[0_24px_34px_rgba(0,0,0,0.6)]"
          loading="eager"
        />
        <p className="max-w-[680px] mx-auto mb-5 sm:mb-6 text-muted-foreground text-[14px] sm:text-base text-center leading-relaxed">
          Ce ne sont ni des cours ni des leçons à regarder. C’est une{' '}
          <strong className="text-primary font-bold">
            bibliothèque numérique
          </strong>{' '}
          de plus de 4 000 plans éprouvés, avec les cotes, les listes de
          matériaux, les coûts, les prix conseillés et les bénéfices estimés.{' '}
          <strong className="text-primary font-bold">
            Accédez-y immédiatement
          </strong>{' '}
          pour commencer à fabriquer dès aujourd’hui.
        </p>
        <CTAButton href="#packs">Accéder maintenant</CTAButton>
      </div>
    </section>
  )
}

function Problems() {
  return (
    <section className="py-12 sm:py-16 lg:py-[70px] px-4 sm:px-5 bg-secondary text-center">
      <div className="w-full max-w-[1050px] mx-auto">
        <SectionHeading
          title="Cela vous parle, dans votre atelier ?"
          lead="Vous travaillez dur chaque jour, mais les bénéfices ne suivent jamais."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 sm:mt-10 text-left">
          {PROBLEM_CARDS.map((c, i) => (
            <article
              key={i}
              className="bg-card border border-border rounded-[10px] p-5 sm:p-6"
            >
              <div className="text-primary text-2xl leading-none">{c.icon}</div>
              <h3 className="text-[17px] sm:text-lg font-bold mt-3 mb-2 leading-snug">
                {c.title}
              </h3>
              <p className="text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed m-0">
                {c.text}
              </p>
            </article>
          ))}
        </div>
        <p className="italic text-[#bcc0c7] max-w-[690px] mx-auto mt-7 sm:mt-8 text-[15px] sm:text-base leading-relaxed">
          Le problème n’est pas le manque de travail. C’est de ne pas avoir le
          bon plan sous la main quand un client appelle.
        </p>
      </div>
    </section>
  )
}

function Intro() {
  return (
    <section className="py-12 sm:py-16 lg:py-[70px] px-4 sm:px-5 text-center">
      <div className="w-full max-w-[760px] mx-auto">
        <h2 className="text-[27px] sm:text-[32px] md:text-[38px] leading-[1.15] tracking-[-0.035em] text-primary font-bold m-0 mb-4">
          Qu’est-ce que Le trésor du soudeur ?
        </h2>
        <p className="max-w-[735px] mx-auto mb-4 text-[15px] sm:text-base text-[#c0c1c5] leading-relaxed">
          C’est une{' '}
          <strong className="text-primary font-bold">
            bibliothèque numérique de plus de 4 000 plans de métallerie
          </strong>{' '}
          classés par catégorie : portails, grilles de protection, mobilier
          industriel, remorques, structures métalliques, abris, escaliers,
          garde-corps et bien plus.
        </p>
        <p className="max-w-[735px] mx-auto mb-4 text-[15px] sm:text-base text-[#c0c1c5] leading-relaxed">
          Chaque plan contient ce qu’il vous faut pour fabriquer et vendre :
          cotes précises, schémas de coupe, liste de matériaux, type et
          épaisseur des profilés, coût de fabrication, prix de vente conseillé
          et bénéfice estimé.
        </p>
        <p className="max-w-[735px] mx-auto mb-5 text-[15px] sm:text-base text-[#c0c1c5] leading-relaxed">
          <strong className="text-primary font-bold">
            Ouvrez un plan sur votre téléphone, relevez les cotes, fabriquez et
            vendez. C’est aussi simple que cela.
          </strong>
        </p>
        <img
          src="/assets/pack-pro.webp"
          width={1100}
          height={1100}
          alt="Présentation de la bibliothèque de plans"
          className="w-full max-w-[420px] xs:max-w-[500px] sm:max-w-[650px] mx-auto my-3 sm:my-4 drop-shadow-[0_18px_32px_#000]"
          loading="lazy"
        />
        <CTAButton href="#packs">Voir le pack complet</CTAButton>
      </div>
    </section>
  )
}

function Gallery() {
  const renderRow = (
    items: { src: string; alt: string }[],
    reverse = false
  ) => {
    const doubled = [...items, ...items]
    return (
      <div
        className={`flex gap-3 sm:gap-4 w-max ${
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        }`}
      >
        {doubled.map((img, i) => (
          <img
            key={i}
            src={img.src}
            alt={img.alt}
            className="w-[132px] h-[140px] sm:w-[175px] sm:h-[175px] object-contain rounded-[10px] bg-[#e8e9e9] p-1 shadow-[0_7px_18px_#0004] flex-shrink-0"
            loading="lazy"
          />
        ))}
      </div>
    )
  }

  return (
    <section className="py-12 sm:py-16 lg:py-[70px] px-0 sm:px-5 bg-secondary text-center overflow-hidden">
      <div className="w-full max-w-[1050px] mx-auto px-4 sm:px-5">
        <SectionHeading
          title="Découvrez les plans"
          lead="Plus de 4 000 plans prêts à fabriquer : portails, mobilier industriel, remorques, structures métalliques, abris et bien plus."
        />
      </div>
      <div
        className="marquee-pause mt-8 sm:mt-10 flex flex-col gap-4 sm:gap-[18px] overflow-hidden"
        aria-label="Exemples de plans de métallerie"
      >
        {renderRow(GALLERY_ROW_1)}
        {renderRow(GALLERY_ROW_2, true)}
        {renderRow(GALLERY_ROW_3)}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="py-12 sm:py-16 lg:py-[70px] px-4 sm:px-5 text-center">
      <div className="w-full max-w-[1050px] mx-auto">
        <SectionHeading
          title="Que contient chaque plan ?"
          lead="Tout ce qu’il vous faut pour ouvrir le fichier, fabriquer la pièce et la vendre avec une marge. Sans perdre des heures à dessiner ou à calculer."
        />
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-3 mt-7 sm:mt-8 text-left">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-lg text-[14px] sm:text-sm"
            >
              <span className="text-primary text-xl font-bold flex-shrink-0">
                {f.icon}
              </span>
              <span className="text-foreground">{f.label}</span>
            </div>
          ))}
        </div>

        <div className="border border-[#76511f] rounded-xl bg-secondary p-5 sm:p-7 mt-8 shadow-[0_0_35px_rgba(233,148,42,0.07)]">
          <h3 className="text-primary text-xl sm:text-2xl font-bold m-0">
            ♧ 4 bonus offerts
          </h3>
          <p className="text-muted-foreground text-[14px] sm:text-base mt-1.5 mb-0 mx-auto max-w-[680px]">
            Inclus sans supplément avec Le trésor du soudeur
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-5 sm:mt-6">
            {BONUSES.map((b, i) => (
              <article
                key={i}
                className="bg-card border border-border rounded-[10px] p-2.5 sm:p-3.5 text-center"
              >
                <img
                  src={b.img}
                  alt={b.alt}
                  className="h-[145px] xs:h-[180px] sm:h-[225px] w-full object-contain mx-auto"
                  loading="lazy"
                />
                <small className="block text-primary font-extrabold mt-2 sm:mt-3 mb-1 text-[11px] sm:text-xs">
                  {b.label}
                </small>
                <strong className="text-[12px] xs:text-[13px] sm:text-[15px] font-semibold leading-snug block">
                  {b.title}
                </strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Benefits() {
  return (
    <section className="py-12 sm:py-16 lg:py-[70px] px-4 sm:px-5 bg-secondary text-center">
      <div className="w-full max-w-[1050px] mx-auto">
        <SectionHeading
          title="Ce qui change dans votre atelier"
          lead="Moins de temps perdu. Plus de pièces terminées. Plus d’argent dans votre poche."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 sm:mt-10 text-left">
          {BENEFITS.map((b, i) => (
            <article
              key={i}
              className="bg-card border border-border rounded-[10px] p-5 sm:p-6"
            >
              <div className="text-primary text-2xl leading-none">
                {b.icon}
              </div>
              <h3 className="text-[17px] sm:text-lg font-bold mt-3 mb-2 leading-snug">
                {b.title}
              </h3>
              <p className="text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed m-0">
                {b.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function PriceCard({
  variant,
  image,
  alt,
  title,
  oldPrice,
  todayOnly,
  price,
  features,
  ctaLabel,
  onCheckout,
}: {
  variant: 'base' | 'pro'
  image: string
  alt: string
  title: string
  oldPrice?: string
  todayOnly?: boolean
  price: string
  features: string[]
  ctaLabel: string
  onCheckout: () => void
}) {
  const isPro = variant === 'pro'
  return (
    <article
      className={`relative bg-card border rounded-[10px] p-5 sm:p-6 flex flex-col ${
        isPro
          ? 'border-[#a56b27] shadow-[0_0_30px_rgba(233,148,42,0.1)]'
          : 'border-border'
      }`}
    >
      {isPro && (
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] sm:text-xs font-extrabold rounded-full px-4 sm:px-[18px] py-1.5 sm:py-[7px] whitespace-nowrap">
          Le plus complet
        </span>
      )}
      <img
        src={image}
        alt={alt}
        className="h-[180px] xs:h-[210px] sm:h-[230px] w-full object-contain"
        loading="lazy"
      />
      <h3 className="text-center text-xl sm:text-[22px] font-bold mt-1.5 mb-2">
        {title}
      </h3>
      {oldPrice && (
        <div className="text-center line-through text-destructive text-lg sm:text-[21px] font-extrabold">
          {oldPrice}
        </div>
      )}
      {todayOnly && (
        <div className="text-center text-destructive text-[12px] sm:text-[13px] font-extrabold">
          Seulement aujourd’hui !
        </div>
      )}
      {oldPrice && (
        <div className="text-center text-muted-foreground text-[12px] sm:text-[13px] mt-1">
          pour
        </div>
      )}
      <div className="text-primary text-[36px] sm:text-[43px] font-extrabold text-center leading-tight">
        {price}
      </div>
      <ul className="list-none p-0 m-5 sm:my-[22px] space-y-2.5">
        {features.map((f, i) => {
          const isBonus = f.startsWith('Bonus')
          return (
            <li
              key={i}
              className={`flex gap-2 items-start text-[13px] sm:text-sm leading-snug ${
                isBonus ? 'text-foreground font-semibold' : 'text-[#d4d5d7]'
              }`}
            >
              <span className="text-primary font-extrabold flex-shrink-0">
                ✓
              </span>
              <span>{f}</span>
            </li>
          )
        })}
      </ul>
      <CTAButton variant="block" onClick={onCheckout} className="w-full mt-auto">
        {ctaLabel}
      </CTAButton>
      <p className="text-[11px] sm:text-xs text-[#828790] text-center mt-2.5 mb-0">
        Accès numérique immédiat par e-mail
      </p>
    </article>
  )
}

function Pricing({ onCheckout }: { onCheckout: (plan: 'base' | 'pro') => void }) {
  return (
    <section
      id="packs"
      className="pt-14 sm:pt-[68px] lg:pt-[78px] pb-12 sm:pb-16 lg:pb-[70px] px-4 sm:px-5 text-center scroll-mt-4"
    >
      <div className="w-full max-w-[1050px] mx-auto">
        <SectionHeading
          title="Choisissez votre pack et commencez aujourd’hui"
          lead="Paiement unique · Accès numérique immédiat · Sans abonnement"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-6 md:gap-[26px] max-w-[900px] mx-auto mt-9 sm:mt-9 items-stretch text-left">
          <PriceCard
            variant="base"
            image="/assets/pack-base.webp"
            alt="Forfait de base, plus de 3 000 plans"
            title="Forfait de base"
            price="9 €"
            features={BASE_PLAN_FEATURES}
            ctaLabel="Je veux ce pack maintenant"
            onCheckout={() => onCheckout('base')}
          />
          <PriceCard
            variant="pro"
            image="/assets/pack-pro.webp"
            alt="Forfait professionnel, plus de 4 000 plans"
            title="Forfait professionnel"
            oldPrice="30 €"
            todayOnly
            price="17 €"
            features={PRO_PLAN_FEATURES}
            ctaLabel="Obtenir le pack complet"
            onCheckout={() => onCheckout('pro')}
          />
        </div>
      </div>
    </section>
  )
}

function Guarantee() {
  return (
    <section className="pt-10 sm:pt-[52px] pb-14 sm:pb-[76px] px-4 sm:px-5 text-center">
      <div className="w-full max-w-[760px] mx-auto">
        <div className="text-primary text-[36px] sm:text-[42px] mb-2 leading-none">
          ♢
        </div>
        <h2 className="text-primary text-[24px] sm:text-[29px] font-bold m-0 mb-3 leading-tight">
          Garantie intégrale de 7 jours
        </h2>
        <p className="text-muted-foreground text-[14px] sm:text-base leading-relaxed m-0">
          Essayez Le trésor du soudeur pendant 7 jours. S’il ne vous convient
          pas, demandez un remboursement par e-mail et nous vous rendrons{' '}
          <strong className="text-white font-bold">100 % de votre argent</strong>
          . Sans justification ni complication. Nous prenons le risque.
        </p>
      </div>
    </section>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="bg-card border border-border rounded-lg m-2 group">
      <summary className="list-none cursor-pointer px-5 sm:px-6 py-4 sm:py-[17px] text-primary font-bold flex justify-between gap-5 items-center group-open:pb-4">
        <span>{q}</span>
        <span className="text-xl flex-shrink-0 transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <p className="border-t border-border m-0 px-5 sm:px-6 py-4 text-[#c2c6cb] text-[14px] sm:text-[15px] leading-relaxed">
        {a}
      </p>
    </details>
  )
}

function Faq() {
  return (
    <section className="py-12 sm:py-16 lg:py-[70px] px-4 sm:px-5 bg-secondary text-center">
      <div className="w-full max-w-[900px] mx-auto">
        <h2 className="text-[27px] sm:text-[32px] md:text-[38px] leading-[1.15] tracking-[-0.035em] text-primary font-bold m-0 mb-2">
          Questions fréquentes
        </h2>
        <div className="text-left mt-5 sm:mt-7">
          {FAQS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])
  const year = mounted ? new Date().getFullYear() : ''
  return (
    <footer className="mt-auto py-6 sm:py-8 px-5 text-center border-t border-[#24272d] text-[#777c84] text-xs sm:text-[13px] safe-area-bottom">
      © {year} Le trésor du soudeur
    </footer>
  )
}

function Notice({ message, show }: { message: string; show: boolean }) {
  if (!show) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#202a34] text-white border border-primary rounded-lg px-5 py-4 z-50 shadow-[0_12px_30px_rgba(0,0,0,0.5)] max-w-[92vw] sm:max-w-[550px] text-center text-[13px] sm:text-sm"
    >
      {message}
    </div>
  )
}

// ============================================================
// UPSELL POPUP
// Opens only when the user clicks the base-plan CTA.
// Confirm  → checkout 12 € (upsell)
// Decline  → checkout 9 €  (base)
// X / Esc / click-outside → close without redirect
// ============================================================
function UpsellModal({
  open,
  onClose,
  onConfirm,
  onDecline,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  onDecline: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Lock body scroll while the modal is open + close on Esc
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    // Measure scrollbar width so locking does not cause layout shift on desktop
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  // Focus the dialog container when it opens (keyboard / a11y)
  useEffect(() => {
    if (open && cardRef.current) {
      // Defer to next frame to ensure the element is painted
      const id = window.requestAnimationFrame(() => {
        cardRef.current?.focus()
      })
      return () => window.cancelAnimationFrame(id)
    }
  }, [open])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Close only when the click lands on the backdrop itself, not on the card
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      // BACKDROP — dark + blurred
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
      aria-labelledby="upsell-title"
      aria-describedby="upsell-subtitle"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-[6px] animate-[fadeIn_0.18s_ease-out]"
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        // CARD — blue-graphite background, amber border, discreet glow
        className="
          relative w-full max-w-[440px] sm:max-w-[460px]
          max-h-[92vh] overflow-y-auto
          rounded-2xl
          bg-[#0e1520]
          border border-[#a56b27]
          shadow-[0_0_40px_rgba(233,148,42,0.18),0_24px_60px_rgba(0,0,0,0.6)]
          outline-none
          animate-[popIn_0.22s_ease-out]
        "
      >
        {/* Custom scrollbar styling (inline so it stays scoped) */}
        <style>{`
          .upsell-scroll::-webkit-scrollbar { width: 8px; }
          .upsell-scroll::-webkit-scrollbar-track { background: transparent; }
          .upsell-scroll::-webkit-scrollbar-thumb { background: #26303c; border-radius: 4px; }
        `}</style>

        {/* Close X — top right, no redirect */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la fenêtre"
          className="absolute top-3 right-3 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 border border-[#3a4250] text-[#cfd3d8] hover:bg-black/70 hover:text-white hover:border-[#a56b27] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffae36]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Scrollable content area */}
        <div className="upsell-scroll px-5 sm:px-7 pt-7 sm:pt-9 pb-5 sm:pb-7 text-center">
          {/* Mockup */}
          <img
            src="/assets/pack-pro.webp"
            width={1100}
            height={1100}
            alt="Forfait professionnel — plus de 4 000 plans et 4 bonus"
            className="w-full max-w-[200px] sm:max-w-[220px] mx-auto mb-3 drop-shadow-[0_12px_24px_rgba(0,0,0,0.55)]"
            loading="eager"
          />

          {/* Title */}
          <h3
            id="upsell-title"
            className="text-primary font-extrabold text-[19px] sm:text-[22px] leading-tight m-0 mb-2 tracking-[-0.01em]"
          >
            {UPSELL_TITLE}
          </h3>

          {/* Subtitle */}
          <p
            id="upsell-subtitle"
            className="text-[13.5px] sm:text-[14.5px] text-[#c7ccd3] leading-relaxed m-0 mb-4 sm:mb-5"
          >
            {UPSELL_SUBTITLE}
          </p>

          {/* Price block */}
          <div className="bg-[#0a0b0d] border border-[#26303c] rounded-xl px-4 py-4 sm:py-5 mb-4 sm:mb-5">
            <div className="text-[12px] sm:text-[13px] text-muted-foreground mb-0.5">
              {UPSELL_OLD_PRICE_LABEL}
            </div>
            <div className="text-primary font-extrabold text-[44px] sm:text-[52px] leading-none tracking-[-0.02em]">
              {UPSELL_PRICE}
            </div>
            <div className="text-[11.5px] sm:text-[12.5px] text-[#9aa0a8] mt-1.5">
              {UPSELL_PRICE_NOTE}
            </div>
          </div>

          {/* Checklist */}
          <ul className="list-none p-0 m-0 text-left space-y-2 mb-5 sm:mb-6">
            {UPSELL_FEATURES.map((f, i) => {
              const isBonus = f.startsWith('Bonus')
              return (
                <li
                  key={i}
                  className={`flex gap-2.5 items-start text-[13px] sm:text-[13.5px] leading-snug ${
                    isBonus ? 'text-foreground font-semibold' : 'text-[#cdd1d6]'
                  }`}
                >
                  <span className="text-primary font-extrabold flex-shrink-0 mt-px">
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              )
            })}
          </ul>

          {/* Primary action — amber */}
          <button
            type="button"
            onClick={onConfirm}
            className="
              w-full inline-flex items-center justify-center
              min-h-[54px] px-5 py-3.5
              rounded-lg font-extrabold text-[15px] sm:text-[16px]
              bg-primary text-primary-foreground
              shadow-[0_7px_26px_rgba(233,148,42,0.32)]
              hover:bg-[#ffc064] hover:-translate-y-0.5
              transition-all duration-200
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffae36]
            "
          >
            {UPSELL_CONFIRM_LABEL}
          </button>

          {/* Secondary action — dark */}
          <button
            type="button"
            onClick={onDecline}
            className="
              w-full inline-flex items-center justify-center
              min-h-[48px] px-5 py-3 mt-2.5
              rounded-lg font-bold text-[13px] sm:text-[14px]
              bg-transparent text-[#a6aab1]
              border border-[#3a4250]
              hover:bg-[#161e2a] hover:text-[#e6e8eb] hover:border-[#5a6473]
              transition-all duration-200
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffae36]
            "
          >
            {UPSELL_DECLINE_LABEL}
          </button>

          <p className="text-[11px] text-[#7e848d] mt-3 mb-0">
            Offre unique · Mise à niveau vers le forfait professionnel
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PAGE
// ============================================================
export default function Home() {
  const [notice, setNotice] = useState<{ msg: string; show: boolean }>({
    msg: '',
    show: false,
  })
  const [upsellOpen, setUpsellOpen] = useState(false)

  const showNotice = useCallback((msg: string) => {
    setNotice({ msg, show: true })
    window.setTimeout(() => {
      setNotice((n) => ({ ...n, show: false }))
    }, 4500)
  }, [])

  // Navigate to the embedded Stripe Checkout page for the given plan.
  // All three plans share the same /checkout route; the plan id is passed
  // as a query param so /checkout can fetch the right client_secret from
  // /api/checkout.
  const goToCheckout = useCallback(
    (plan: 'base' | 'upsell' | 'pro') => {
      const route = CHECKOUT_ROUTES[plan]
      if (route) {
        window.location.href = route
        return
      }
      // Defensive: should never happen since CHECKOUT_ROUTES is exhaustive.
      showNotice(
        'Une erreur est survenue. Veuillez recharger la page et réessayer.'
      )
    },
    [showNotice]
  )

  // Path 1 — base plan CTA. Instead of going straight to checkout, we open
  // the upsell popup so the buyer can choose to upgrade to the pro offer
  // at 12 € before paying.
  const handleBaseClick = useCallback(() => {
    setUpsellOpen(true)
  }, [])

  // Path 2 — pro plan CTA. Unchanged: goes to the 17 € checkout.
  const handleProCheckout = useCallback(() => {
    goToCheckout('pro')
  }, [goToCheckout])

  // Upsell confirm — buyer accepts the 12 € professional offer.
  const handleUpsellConfirm = useCallback(() => {
    setUpsellOpen(false)
    goToCheckout('upsell')
  }, [goToCheckout])

  // Upsell decline — buyer keeps the 9 € base plan.
  const handleUpsellDecline = useCallback(() => {
    setUpsellOpen(false)
    goToCheckout('base')
  }, [goToCheckout])

  // Upsell close (X / Esc / click outside) — no redirect.
  const handleUpsellClose = useCallback(() => {
    setUpsellOpen(false)
  }, [])

  // Backwards-compatible handler for the Pricing section.
  // Routes by plan id; base opens the popup, pro goes straight to checkout.
  const handleCheckout = useCallback(
    (plan: 'base' | 'pro') => {
      if (plan === 'base') {
        handleBaseClick()
      } else {
        handleProCheckout()
      }
    },
    [handleBaseClick, handleProCheckout]
  )

  return (
    <main className="flex-1 flex flex-col">
      <Ribbon />
      <Hero />
      <Problems />
      <Intro />
      <Gallery />
      <Features />
      <Benefits />
      <Pricing onCheckout={handleCheckout} />
      <Guarantee />
      <Faq />
      <Footer />
      <Notice message={notice.msg} show={notice.show} />
      <UpsellModal
        open={upsellOpen}
        onClose={handleUpsellClose}
        onConfirm={handleUpsellConfirm}
        onDecline={handleUpsellDecline}
      />
    </main>
  )
}
