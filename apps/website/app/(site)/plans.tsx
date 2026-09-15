"use client";

import { useAuth } from "@clerk/nextjs";
import { Buildings, Check, Lightning, Microphone } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, money, planLimits, type Billing } from "../lib";
import { PLANS } from "../plans";

const ABOUT: Record<string, [typeof Microphone, string]> = {
  creator: [Microphone, "For one show or channel."],
  pro: [Lightning, "For weekly shows and busy channels."],
  business: [Buildings, "For teams and agencies with many videos."],
};
const EVERY_PLAN = ["Captions, hooks and titles", "Posts for six platforms", "Calendar and publishing"];

/** The plans with the signed-in account's current one marked. Prices come from plans.ts, so visitors see them too. */
export function Plans() {
  const { isSignedIn } = useAuth();
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    if (isSignedIn) api<Billing>("billing").then((b) => setCurrent(b.subscription?.plan)).catch(() => {});
  }, [isSignedIn]);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {PLANS.map((plan) => {
        const [Icon, about] = ABOUT[plan.id];
        const featured = plan.id === "pro";
        return (
          <div key={plan.id}
               className={`flex flex-col rounded-3xl p-7 ${featured
                 ? "bg-[linear-gradient(180deg,#dfe8ff_0%,#f3f6ff_45%,#fff_100%)] shadow-float ring-1 ring-accent/20"
                 : "bg-surface shadow-card"}`}>
            <div className="flex items-center gap-3">
              <span className={`grid size-10 place-items-center rounded-xl ${featured ? "bg-accent text-white" : "bg-accent-soft text-accent"}`}>
                <Icon weight="fill" className="size-5" />
              </span>
              <h2 className="text-lg font-semibold tracking-[-0.02em]">{plan.name}</h2>
            </div>
            <p className="mt-3 text-muted lg:min-h-12">{about}</p>
            <p className="mt-6 flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-[-0.04em]">{money(plan.price_cents).replace(".00", "")}</span>
              <span className="text-muted">a month</span>
            </p>
            {current === plan.id ? (
              <Link href="/settings/billing" className="btn mt-6 w-full" aria-current="true">Your current plan</Link>
            ) : (
              <Link href={`/checkout?plan=${plan.id}`} className={`btn mt-6 w-full ${featured ? "btn-primary" : ""}`}>Choose {plan.name}</Link>
            )}
            <ul className="mt-7 grid gap-3 border-t border-line pt-6 text-[15px]">
              {[...planLimits(plan), ...EVERY_PLAN].map((line) => (
                <li key={line} className="flex items-center gap-2.5">
                  <Check weight="bold" className="size-4 shrink-0 text-accent" /> {line}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
