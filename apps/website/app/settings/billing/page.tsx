"use client";

import Link from "next/link";
import { useState } from "react";
import { api, day, hours, money, usePoll, type Billing } from "../../lib";

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
      <section className="pt-10">
        <h1 className="font-display text-3xl tracking-tight">Billing</h1>
        {error ? <p role="alert" className="mt-6 text-danger">{error.message}</p>
               : <div className="mt-8 h-40 max-w-xl rounded-md bg-line motion-safe:animate-pulse" aria-label="Loading billing" />}
      </section>
    );
  }

  const { subscription, usage } = data;
  const plan = data.plans.find((p) => p.id === subscription?.plan);
  const name = (id: string) => data.plans.find((p) => p.id === id)?.name ?? id;
  const meters = [
    ["Videos started", String(usage.videos), plan?.videos != null ? String(plan.videos) : undefined],
    ["Video processed", hours(usage.minutes), plan && hours(plan.minutes)],
    ["Clips made", String(usage.clips), plan && String(plan.clips)],
  ];

  return (
    <section className="pt-10">
      <h1 className="font-display text-3xl tracking-tight">Billing</h1>

      {subscription && plan ? (
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
          <div>
            <p className="text-sm text-muted">Current plan</p>
            <p className="mt-1 font-display text-2xl tracking-tight">{plan.name}</p>
            <p className="mt-1 text-muted">
              {money(subscription.price_cents)} a month, not charged during early access. Started {day(subscription.started_at)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pricing" className="btn">Change plan</Link>
            <button className="btn" onClick={cancel} disabled={busy}>{busy ? "Cancelling..." : "Cancel plan"}</button>
          </div>
        </div>
      ) : (
        <div className="mt-8 border-b border-line pb-8">
          <p className="text-lg">You don&apos;t have a plan yet.</p>
          <p className="mt-1 text-muted">Choose one to start making clips. It&apos;s free during early access.</p>
          <Link href="/pricing" className="btn btn-primary mt-6">See plans</Link>
        </div>
      )}
      {failure && <p role="alert" className="mt-4 text-danger">{failure}</p>}

      <h2 className="mt-10 text-lg font-semibold">This month</h2>
      <dl className="mt-4 grid gap-6 sm:grid-cols-3">
        {meters.map(([label, used, limit]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl tabular-nums">
              {used}
              {limit && <span className="text-base text-muted"> of {limit}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-lg font-semibold">Billing history</h2>
      {data.history.length === 0 ? (
        <p className="mt-4 text-muted">Nothing yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] whitespace-nowrap text-left tabular-nums">
            <thead className="text-sm text-muted">
              <tr className="border-b border-line">
                <th className="py-3 pr-6 font-normal">Date</th>
                <th className="py-3 pr-6 font-normal">Plan</th>
                <th className="py-3 pr-6 font-normal">Price</th>
                <th className="py-3 pr-6 font-normal">Charged</th>
                <th className="py-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.history.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 pr-6">{day(s.started_at)}</td>
                  <td className="py-3 pr-6">{name(s.plan)}</td>
                  <td className="py-3 pr-6">{money(s.price_cents)} a month</td>
                  <td className="py-3 pr-6">{money(s.charged_cents)}</td>
                  <td className="py-3 text-muted">{s.status === "active" ? "Active" : `Ended ${day(s.ended_at!)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
