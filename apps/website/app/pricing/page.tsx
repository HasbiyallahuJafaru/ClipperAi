"use client";

import Link from "next/link";
import { money, planLimits, usePoll, type Billing } from "../lib";

export default function Pricing() {
  const { data, error } = usePoll<Billing>("billing", () => false);
  const current = data?.subscription?.plan;

  return (
    <section className="pt-10 sm:pt-16">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Pricing</h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Every plan makes captioned vertical clips with posts for six platforms. Plans differ in how much you can make each
        month.
      </p>

      {error && <p role="alert" className="mt-8 text-danger">{error.message}</p>}
      {!data ? (
        !error && <div className="mt-12 h-72 rounded-md bg-line motion-safe:animate-pulse" aria-label="Loading plans" />
      ) : (
        <div className="mt-12 grid divide-y divide-line border-y border-line md:grid-cols-3 md:divide-x md:divide-y-0">
          {data.plans.map((plan) => (
            <div key={plan.id} className="flex flex-col py-8 md:px-8 md:first:pl-0 md:last:pr-0">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-display text-5xl tracking-tight tabular-nums">{money(plan.price_cents).replace(".00", "")}</span>
                <span className="text-muted">a month</span>
              </p>
              <ul className="mt-6 grid flex-1 content-start gap-2">
                {planLimits(plan).map((line) => <li key={line}>{line}</li>)}
              </ul>
              {current === plan.id ? (
                <Link href="/settings/billing" className="btn mt-8" aria-current="true">Your current plan</Link>
              ) : (
                <Link href={`/checkout?plan=${plan.id}`} className="btn mt-8">Choose {plan.name}</Link>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 max-w-xl text-sm text-muted">
        Payments are switched off during early access, so any plan is free for now. No card needed.
      </p>
    </section>
  );
}
