import type { Metadata } from "next";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { JsonLd, NAME } from "../../site";
import { PLANS } from "../../plans";
import { Plans } from "../plans";
import { PageHero } from "../sections";

export const metadata: Metadata = {
  title: "Pricing: AI Clip Maker Plans With No Credits and No Watermark",
  description: "Simple monthly plans counted in videos, minutes and clips. No credits, no watermark, failed videos don't count, cancel in one click.",
  alternates: { canonical: "/pricing" },
};

// what other clip makers get criticised for, answered as plain facts (compare/data.ts has the sources)
const PROMISES = [
  "No credits: videos, minutes and clips, counted plainly",
  "No watermark on any plan",
  "Failed or cancelled videos don't count",
  "Clips stay downloadable for 30 days, even after you cancel",
  "Cancel in one click, it ends straight away",
  "Your original video is deleted after processing",
];

export default function Pricing() {
  return (
    <>
      <PageHero title={<>Choose your <em>plan</em></>} extra={
        <p className="mx-auto mt-6 w-fit rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-accent-ink shadow-card">
          Payments are switched off during early access, so any plan is free for now. No card needed.
        </p>
      }>
        Every plan makes captioned vertical clips with posts for six platforms. Plans differ in how much you can make each month.
      </PageHero>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "SoftwareApplication", name: NAME, applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        offers: PLANS.map((plan) => ({
          "@type": "Offer", name: plan.name, price: (plan.price_cents / 100).toFixed(2), priceCurrency: "USD", category: "subscription",
        })),
      }} />
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-24 sm:px-6 sm:pb-32">
        <Plans />
        <section className="card mt-10 rounded-3xl p-6 sm:p-10">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">What every plan promises</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {PROMISES.map((promise) => (
              <li key={promise} className="flex gap-3"><CheckCircle weight="fill" className="mt-0.5 size-5 shrink-0 text-accent" />{promise}</li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted">
            Coming from another clip maker? <Link href="/compare" className="link font-medium">See how {NAME} compares</Link>.
          </p>
        </section>
      </div>
    </>
  );
}
