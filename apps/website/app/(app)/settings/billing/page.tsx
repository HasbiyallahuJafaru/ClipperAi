"use client";

import { CreditCard } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { api, day, hours, money, usePoll, type Billing } from "@/app/lib";
import { PageHeader } from "@/app/ui";

export default function BillingPage() {
  const { data, setData, error } = usePoll<Billing>("billing", () => false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");

  async function cancel() {
    if (!confirm("Cancel your plan? New projects can't start until you choose a plan again.")) return;
    setBusy(true);
    setFailure("");
    try {
      await api("billing/cancel", "POST");
      setData(await api<Billing>("billing"));
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section>
        <PageHeader title="Billing" />
        {error ? <p role="alert" className="mt-6 text-danger">{error.message}</p>
               : <div className="skeleton mt-8 h-44 motion-safe:animate-pulse" aria-label="Loading billing" />}
      </section>
    );
  }

  const { subscription, usage } = data;
  const plan = data.plans.find((p) => p.id === subscription?.plan);
  const name = (id: string) => data.plans.find((p) => p.id === id)?.name ?? id;
  const meters: [string, string, string | undefined, number | undefined][] = [
    ["Videos started", String(usage.videos), plan?.videos != null ? String(plan.videos) : undefined, plan?.videos != null ? usage.videos / plan.videos : undefined],
    ["Video processed", hours(usage.minutes), plan && hours(plan.minutes), plan && usage.minutes / plan.minutes],
    ["Clips made", String(usage.clips), plan && String(plan.clips), plan && usage.clips / plan.clips],
  ];

  return (
    <section>
      <PageHeader title="Billing">Your plan, what you&apos;ve used this month and past plans.</PageHeader>

      {subscription && plan ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-[linear-gradient(120deg,#e3ebff,#f5f8ff_60%,#fff)] p-6 shadow-card ring-1 ring-accent/15 sm:p-8">
          <div className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-white"><CreditCard weight="fill" className="size-6" /></span>
            <div>
              <p className="text-sm text-muted">Current plan</p>
              <p className="text-2xl font-semibold tracking-[-0.03em]">{plan.name}</p>
              <p className="mt-0.5 text-muted">
                {money(subscription.price_cents)} for 30 days{subscription.expires_at
                  ? `, active until ${day(subscription.expires_at)}`
                  : ", not charged during early access"}. Started {day(subscription.started_at)}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pricing" className="btn">Change plan</Link>
            <button className="btn" onClick={cancel} disabled={busy}>{busy ? "Cancelling..." : "Cancel plan"}</button>
          </div>
        </div>
      ) : (
        <div className="card mt-8 rounded-3xl p-6 sm:p-8">
          <p className="text-xl font-semibold tracking-[-0.02em]">You don&apos;t have a plan yet.</p>
          <p className="mt-1 text-muted">Choose one to start making clips.</p>
          <Link href="/pricing" className="btn btn-primary mt-6">See plans</Link>
        </div>
      )}
      {failure && <p role="alert" className="mt-4 text-danger">{failure}</p>}

      <h2 className="mt-12 text-xl font-semibold tracking-[-0.02em]">This month</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {meters.map(([label, used, limit, share]) => (
          <div key={label} className="card p-5">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
              {used}
              {limit && <span className="text-base font-normal tracking-normal text-muted"> of {limit}</span>}
            </dd>
            {share !== undefined && (
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ground" aria-hidden="true">
                <div className={`h-full rounded-full ${share >= 1 ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
              </div>
            )}
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-xl font-semibold tracking-[-0.02em]">Billing history</h2>
      {data.history.length === 0 ? (
        <p className="card mt-4 p-5 text-muted">Nothing yet.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left whitespace-nowrap">
            <thead className="text-sm text-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-3.5 font-medium">Date</th>
                <th className="px-5 py-3.5 font-medium">Plan</th>
                <th className="px-5 py-3.5 font-medium">Price</th>
                <th className="px-5 py-3.5 font-medium">Charged</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.history.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3.5">{day(s.started_at)}</td>
                  <td className="px-5 py-3.5 font-medium">{name(s.plan)}</td>
                  <td className="px-5 py-3.5">{money(s.price_cents)} a month</td>
                  <td className="px-5 py-3.5">{money(s.charged_cents)}</td>
                  <td className="px-5 py-3.5">
                    {s.status === "active" ? <span className="chip chip-accent">Active</span> : <span className="chip">Ended {day(s.ended_at!)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
