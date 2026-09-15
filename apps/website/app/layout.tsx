import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
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
        <ClerkProvider appearance={{ variables: { colorPrimary: "#18181b", fontFamily: "inherit", borderRadius: "0.375rem" } }}>
          <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="font-display text-lg tracking-tight">ClipperAi</Link>
            <nav className="flex items-center gap-4 text-sm sm:gap-5">
              <Show when="signed-in">
                <Link href="/dashboard" className="link">Projects</Link>
                <Link href="/settings/integrations" className="link">Publishing</Link>
              </Show>
              <Link href="/pricing" className="link">Pricing</Link>
              <Show when="signed-in">
                <Link href="/settings/billing" className="link">Billing</Link>
                <UserButton />
              </Show>
              <Show when="signed-out">
                <SignInButton><button type="button" className="link">Sign in</button></SignInButton>
                <SignUpButton><button type="button" className="btn btn-primary">Sign up</button></SignUpButton>
              </Show>
            </nav>
          </header>
          <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
