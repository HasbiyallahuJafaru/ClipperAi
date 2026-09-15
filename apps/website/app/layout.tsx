import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

// The face burned into every clip's captions, so the site and the clips speak with one voice.
const montserrat = localFont({ src: "./fonts/Montserrat-ExtraBold.ttf", weight: "800", variable: "--font-montserrat" });

export const metadata: Metadata = {
  title: "ClipperAi",
  description: "Turn one video into weeks of content.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className="min-h-dvh antialiased">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-display text-lg tracking-tight">ClipperAi</Link>
          <nav className="flex gap-4 text-sm sm:gap-5">
            <Link href="/dashboard" className="link">Projects</Link>
            <Link href="/settings/integrations" className="link">Publishing</Link>
            <Link href="/pricing" className="link">Pricing</Link>
            <Link href="/settings/billing" className="link">Billing</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
