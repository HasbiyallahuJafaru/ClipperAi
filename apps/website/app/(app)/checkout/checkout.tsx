"use client";

import { CaretLeft, Check } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, money, planLimits, usePoll, type Billing } from "@/app/lib";
import { PageHeader } from "@/app/ui";

export function Checkout({ planId }: { planId: string }) {
  const router = useRouter();
  const { data, error } = usePoll<Billing>("billing", () => false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  const plan = data?.plans.find((p) => p.id === planId);
  const current = data?.plans.find((p) => p.id === data.subscription?.plan);

  async function start() {
    setBusy(true);
    setFailure("");
    try {
      await api("billing/subscribe", "POST", { plan: planId });
      router.push("/settings/billing");
    } catch (e) {
      setFailure((e as Error).message);
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
                <dt>{plan.name}, billed monthly</dt>
                <dd>{money(plan.price_cents)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-4 text-accent-ink">
                <dt>Early access: payments switched off</dt>
                <dd>-{money(plan.price_cents)}</dd>
              </div>
              <div className="flex justify-between gap-4 pt-4 text-xl font-semibold tracking-[-0.02em]">
                <dt>Due today</dt>
                <dd>{money(0)}</dd>
              </div>
            </dl>

            {current && current.id !== plan.id && (
              <p className="mt-6 rounded-xl bg-ground px-4 py-3">This replaces your {current.name} plan straight away.</p>
            )}
            <p className="mt-5 text-sm text-muted">No card needed. You won&apos;t be charged while payments are switched off.</p>

            {current?.id === plan.id ? (
              <Link href="/settings/billing" className="btn mt-6 w-full">This is your current plan</Link>
            ) : (
              <button className="btn btn-primary mt-6 h-12 w-full" onClick={start} disabled={busy}>
                {busy ? "Starting..." : `Start ${plan.name} plan`}
              </button>
            )}
            {failure && <p role="alert" className="mt-4 text-danger">{failure}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
