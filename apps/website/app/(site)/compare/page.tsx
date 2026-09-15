import { CaretRight } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { NAME } from "../../site";
import { CtaBand, PageHero } from "../sections";
import { CHECKED, COMPETITORS } from "./data";

export const metadata: Metadata = {
  title: `Best OpusClip, Klap, Vizard & Submagic Alternatives (${CHECKED})`,
  description: `How ${NAME} compares with OpusClip, Klap, Vizard and Submagic: pricing, common complaints and when each is the better pick.`,
  alternates: { canonical: "/compare" },
};

export default function CompareHub() {
  return (
    <>
      <PageHero title={<>{NAME} <em>compared</em></>}>
        Honest comparisons with the AI clip makers people usually try first.
      </PageHero>
      <div className="px-4 pt-14 pb-24 sm:px-6 sm:pb-32">
      <ul className="card mx-auto max-w-3xl divide-y divide-line overflow-hidden">
        {COMPETITORS.map(({ slug, name, complaints }) => (
          <li key={slug}>
            <Link href={`/compare/${slug}`} className="group flex items-center gap-4 px-5 py-5 hover:bg-ground/70">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{NAME} vs {name}</span>
                <span className="block truncate text-sm text-muted">{complaints[0][0]}</span>
              </span>
              <CaretRight weight="bold" className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
      </div>
      <CtaBand />
    </>
  );
}
