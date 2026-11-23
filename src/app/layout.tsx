import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter with latin + latin-ext subsets (latin-ext covers French accents).
// display: 'swap' prevents FOIT — text is visible immediately with the
// fallback font, then swaps to Inter when ready.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // Don't preload every weight — only the ones actually used (400 + 700 + 800).
  // Next/font already handles this automatically.
  weight: ["400", "700", "800"],
});

export const metadata: Metadata = {
  title: "Le trésor du soudeur | Plus de 4 000 plans de métallerie",
  description:
    "Plus de 4 000 plans de métallerie prêts à ouvrir, relever les cotes, fabriquer et vendre. Portails, mobilier industriel, remorques, structures métalliques et bien plus.",
  keywords: [
    "plans de métallerie",
    "plans de soudure",
    "métallerie",
    "soudeur",
    "plans de portails",
    "mobilier industriel",
    "remorques",
    "structures métalliques",
  ],
  authors: [{ name: "Le trésor du soudeur" }],
  openGraph: {
    title: "Le trésor du soudeur | Plus de 4 000 plans de métallerie",
    description:
      "Plus de 4 000 plans de métallerie prêts à ouvrir, relever les cotes, fabriquer et vendre.",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Le trésor du soudeur",
    description:
      "Plus de 4 000 plans de métallerie prêts à ouvrir, relever les cotes, fabriquer et vendre.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  width: "device-width",
  initialScale: 1,
  // Disable zoom-blocking so users can pinch-zoom on mobile (a11y).
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className="dark">
      <head>
        {/* Preconnect to Google Fonts (used by next/font) so the font
            request starts as early as possible. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Preload the hero image so it starts downloading immediately —
            before the JS bundle finishes parsing. */}
        <link
          rel="preload"
          as="image"
          href="/assets/pack-pro.webp"
          fetchPriority="high"
        />
      </head>
      <body
        className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
