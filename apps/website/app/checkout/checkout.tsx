"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, money, planLimits, usePoll, type Billing } from "../lib";

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
    <section className="max-w-lg pt-10">
      <Link href="/pricing" className="link text-sm text-muted">Pricing</Link>
      <h1 className="mt-3 font-display text-3xl tracking-tight">Checkout</h1>

      {error ? (
        <p role="alert" className="mt-8 text-danger">{error.message}</p>
      ) : !data ? (
        <div className="mt-8 h-64 rounded-md bg-line motion-safe:animate-pulse" aria-label="Loading checkout" />
      ) : !plan ? (
        <p className="mt-8 text-lg">
          That plan doesn&apos;t exist. <Link href="/pricing" className="link">Choose a plan</Link>
        </p>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-semibold">{plan.name} plan</h2>
          <ul className="mt-3 grid gap-1 text-muted">
            {planLimits(plan).map((line) => <li key={line}>{line}</li>)}
          </ul>

          <dl className="mt-8 divide-y divide-line border-y border-line tabular-nums">
            <div className="flex justify-between gap-4 py-4">
              <dt>{plan.name}, billed monthly</dt>
              <dd>{money(plan.price_cents)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-4">
              <dt>Early access: payments switched off</dt>
              <dd>-{money(plan.price_cents)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-4 text-lg font-semibold">
              <dt>Due today</dt>
              <dd>{money(0)}</dd>
            </div>
          </dl>

          {current && current.id !== plan.id && (
            <p className="mt-6">This replaces your {current.name} plan straight away.</p>
          )}
          <p className="mt-6 text-sm text-muted">No card needed. You won&apos;t be charged while payments are switched off.</p>

          {current?.id === plan.id ? (
            <Link href="/settings/billing" className="btn mt-8 w-full">This is your current plan</Link>
          ) : (
            <button className="btn btn-primary mt-8 w-full" onClick={start} disabled={busy}>
              {busy ? "Starting..." : `Start ${plan.name} plan`}
            </button>
          )}
          {failure && <p role="alert" className="mt-4 text-danger">{failure}</p>}
        </>
      )}
    </section>
  );
}
