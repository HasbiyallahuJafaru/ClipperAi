"use client";

import { CreditCard, ShareNetwork, SquaresFour, Tag } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/dashboard", "Projects", SquaresFour],
  ["/settings/integrations", "Publishing", ShareNetwork],
  ["/settings/billing", "Billing", CreditCard],
  ["/pricing", "Pricing", Tag],
] as const;

export function AppNav() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="-mb-px flex basis-full gap-1 overflow-x-auto lg:mb-0 lg:basis-auto lg:flex-col lg:overflow-visible">
      {LINKS.map(([href, label, Icon]) => {
        // a project and its calendar belong to Projects
        const active = path === href || (href === "/dashboard" && path.startsWith("/projects"));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`flex h-11 shrink-0 items-center gap-2.5 border-b-2 px-3 text-[15px] transition-colors lg:h-10 lg:rounded-xl lg:border-b-0 ${active
                  ? "border-accent font-medium text-ink lg:bg-accent-soft lg:text-accent-ink"
                  : "border-transparent text-muted hover:text-ink lg:hover:bg-ground"}`}>
            <Icon weight={active ? "fill" : "regular"} className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
