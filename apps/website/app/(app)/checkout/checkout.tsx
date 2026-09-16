"use client";

import { CaretLeft, Check } from "@phosphor-icons/react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { api, money, planLimits, usePoll, type Billing } from "@/app/lib";
import { PageHeader } from "@/app/ui";

type Quote = { authorization_url: string; usd_cents: number; kobo: number; rate: number };

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

export function Checkout({ planId }: { planId: string }) {
  const { user } = useUser();
  const { data, error } = usePoll<Billing>("billing", () => false);
  const [email, setEmail] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const plan = data?.plans.find((p) => p.id === planId);
  const current = data?.plans.find((p) => p.id === data.subscription?.plan);
  const address = email || user?.primaryEmailAddress?.emailAddress || "";

  async function start() {
    setBusy(true);
    setFailure("");
    try {
      setQuote(await api<Quote>("billing/checkout", "POST", { plan: planId, email: address }));
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHeader title="Checkout" back={<Link href="/pricing" className="inline-flex items-center gap-1 hover:text-ink"><CaretLeft weight="bold" className="size-3.5" />Pricing</Link>} />

      {error ? (
        <p role="alert" className="mt-8 text-danger">{error.message}</p>
      ) : !data ? (
        <div className="skeleton mt-8 h-72 max-w-3xl motion-safe:animate-pulse" aria-label="Loading checkout" />
      ) : !plan ? (
        <p className="mt-8 text-lg">
          That plan doesn&apos;t exist. <Link href="/pricing" className="link">Choose a plan</Link>
        </p>
      ) : (
        <div className="mt-8 grid max-w-4xl items-start gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="rounded-3xl bg-[linear-gradient(180deg,#e3ebff,#f5f8ff_55%,#fff)] p-6 shadow-card ring-1 ring-accent/15 sm:p-7">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">{plan.name} plan</h2>
            <ul className="mt-5 grid gap-3">
              {planLimits(plan).map((line) => (
                <li key={line} className="flex items-center gap-2.5"><Check weight="bold" className="size-4 text-accent" />{line}</li>
              ))}
            </ul>
          </div>

          <div className="card rounded-3xl p-6 sm:p-7">
            <dl className="divide-y divide-line">
              <div className="flex justify-between gap-4 pb-4">
                <dt>{plan.name}, 30 days</dt>
                <dd>{money(plan.price_cents)}</dd>
              </div>
              {quote && (
                <div className="flex justify-between gap-4 py-4">
                  <dt>Charged in Naira (rate {quote.rate.toLocaleString("en-NG")} per $)</dt>
                  <dd>{naira(quote.kobo)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 pt-4 text-xl font-semibold tracking-[-0.02em]">
                <dt>Due today</dt>
                <dd>{naira(quote?.kobo ?? 0)}</dd>
              </div>
            </dl>

            {current && current.id !== plan.id && (
              <p className="mt-6 rounded-xl bg-ground px-4 py-3">This replaces your {current.name} plan straight away.</p>
            )}
            <p className="mt-5 text-sm text-muted">Each payment covers 30 days. No card is kept and nothing charges
              itself — near the end, your plan shows Renew.</p>

            {current?.id === plan.id ? (
              <Link href="/settings/billing" className="btn mt-6 w-full">This is your current plan</Link>
            ) : quote ? (
              <a className="btn btn-primary mt-6 flex h-12 w-full items-center justify-center"
                 href={quote.authorization_url}>Pay {naira(quote.kobo)} — continue to payment</a>
            ) : (
              <div className="mt-6 grid gap-3">
                <label className="text-sm text-muted" htmlFor="email">Email for your receipt</label>
                <input id="email" type="email" className="input" value={address} placeholder="you@example.com"
                       onChange={(e) => setEmail(e.target.value)} />
                <button className="btn btn-primary h-12 w-full" onClick={start}
                        disabled={busy || !address.includes("@")}>
                  {busy ? "Getting the price..." : `Start ${plan.name} plan`}
                </button>
              </div>
            )}
            {failure && <p role="alert" className="mt-4 text-danger">{failure}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
