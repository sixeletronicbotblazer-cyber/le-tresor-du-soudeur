import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className="dark">
      <body
        className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
