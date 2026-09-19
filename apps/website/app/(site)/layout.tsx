import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Logo, PAGES } from "../ui";
import { COMPETITORS } from "./compare/data";
import { SiteNav } from "./nav";
import { TOOLS } from "./tools/data";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full bg-white/70 pr-2 pl-4 shadow-[0_1px_2px_rgb(16_24_48/.05),0_12px_32px_-16px_rgb(22_50_140/.28)] ring-1 ring-white/70 backdrop-blur-xl sm:pl-5">
          <Logo />
          <SiteNav />
          <div className="flex items-center gap-1.5">
            <Show when="signed-out">
              <SignInButton><button type="button" className="btn btn-ghost btn-sm hover:bg-white">Sign in</button></SignInButton>
              <SignUpButton><button type="button" className="btn btn-primary btn-sm">Sign up</button></SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link href="/dashboard" className="btn btn-primary btn-sm">Projects</Link>
              <span className="grid size-9 place-items-center"><UserButton /></span>
            </Show>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted">Turn one video into a month of content.</p>
          </div>
          <nav aria-label="Product" className="text-sm">
            <h2 className="font-medium tracking-normal">Product</h2>
            <ul className="mt-3 grid gap-2.5 text-muted">
              {PAGES.map(([label, href]) => <li key={href}><Link href={href} className="hover:text-ink">{label}</Link></li>)}
            </ul>
          </nav>
          <nav aria-label="Tools" className="text-sm">
            <h2 className="font-medium tracking-normal">Tools</h2>
            <ul className="mt-3 grid gap-2.5 text-muted">
              {TOOLS.map(({ slug, keyword }) => <li key={slug}><Link href={`/tools/${slug}`} className="hover:text-ink">{keyword[0].toUpperCase() + keyword.slice(1)}</Link></li>)}
            </ul>
          </nav>
          <nav aria-label="Compare" className="text-sm">
            <h2 className="font-medium tracking-normal">Compare</h2>
            <ul className="mt-3 grid gap-2.5 text-muted">
              {COMPETITORS.map(({ slug, name }) => <li key={slug}><Link href={`/compare/${slug}`} className="hover:text-ink">{name} alternative</Link></li>)}
            </ul>
          </nav>
          <nav aria-label="Account" className="text-sm">
            <h2 className="font-medium tracking-normal">Account</h2>
            <ul className="mt-3 grid gap-2.5 text-muted">
              <Show when="signed-out">
                <li><Link href="/sign-in" className="hover:text-ink">Sign in</Link></li>
                <li><Link href="/sign-up" className="hover:text-ink">Sign up</Link></li>
              </Show>
              <Show when="signed-in">
                <li><Link href="/dashboard" className="hover:text-ink">Projects</Link></li>
                <li><Link href="/settings/integrations" className="hover:text-ink">Publishing</Link></li>
                <li><Link href="/settings/billing" className="hover:text-ink">Billing</Link></li>
              </Show>
            </ul>
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-6 text-sm text-muted sm:px-6">
          <p>© 2026 YT-Clipper</p>
          <p>
            <Link href="/privacy" className="hover:text-ink">Privacy policy</Link>
            <span className="px-2">·</span>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </p>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-6 text-[11px] sm:px-6">
          <a href="https://hasbiyallahu.xyz" className="opacity-60 transition-opacity hover:underline hover:opacity-100">
            Site by Hasbiyallahu
          </a>
        </div>
      </footer>
    </>
  );
}
