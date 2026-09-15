"use client";

import { List, X } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES } from "../ui";

/** The marketing pages; the one you're on sits in a white pill. */
export function SiteNav() {
  const path = usePathname();
  return (
    <>
      {/* phones: a native disclosure; keyed by page so it closes after you pick one */}
      <details key={path} className="group relative order-last md:hidden">
        <summary aria-label="Menu" className="grid size-10 cursor-pointer list-none place-items-center rounded-full hover:bg-white [&::-webkit-details-marker]:hidden">
          <List weight="bold" className="size-5 group-open:hidden" />
          <X weight="bold" className="hidden size-5 group-open:block" />
        </summary>
        <nav aria-label="Site" className="absolute top-12 right-0 grid w-56 gap-0.5 rounded-2xl bg-white p-2 shadow-float ring-1 ring-line">
          {PAGES.map(([label, href]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
                  className="rounded-xl px-3 py-2.5 hover:bg-ground aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent-ink">
              {label}
            </Link>
          ))}
        </nav>
      </details>
      <SiteLinks path={path} />
    </>
  );
}

function SiteLinks({ path }: { path: string }) {
  return (
    <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
      {PAGES.map(([label, href]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
              className="rounded-full px-3.5 py-2 text-[14.5px] text-ink/75 transition-colors hover:bg-white/80 hover:text-ink aria-[current=page]:bg-white aria-[current=page]:font-medium aria-[current=page]:text-ink aria-[current=page]:shadow-card">
          {label}
        </Link>
      ))}
    </nav>
  );
}
