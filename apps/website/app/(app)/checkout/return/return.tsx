"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, usePoll, type Billing } from "@/app/lib";
import { PageHeader } from "@/app/ui";

type Payment = { status: "pending" | "success" | "failed"; plan: string };

// Where Paystack sends the customer back to. Landing here is not proof of payment: this page waits for the backend
// (the provider's signed webhook or its own verify) to confirm before showing the plan as active.
export function Return({ reference }: { reference: string }) {
  const { data, setData } = usePoll<Billing>("billing", () => false);
  const [state, setState] = useState<"waiting" | "success" | "failed">(reference ? "waiting" : "failed");

  useEffect(() => {
    if (!reference) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const payment = await api<Payment>(`billing/payments/${reference}`);
          if (payment.status !== "pending") {
            setState(payment.status);
            if (payment.status === "success") setData(await api<Billing>("billing"));
            return;
          }
        } catch { /* backend briefly unreachable: keep polling */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    return () => { stop = true; };
  }, [reference, setData]);

  return (
    <section>
      <PageHeader title="Payment" />
      <div className="card mt-8 max-w-xl rounded-3xl p-7">
        {state === "waiting" && (
          <p className="motion-safe:animate-pulse">Checking your payment... this can take a few seconds.</p>
        )}
        {state === "failed" && (
          <>
            <p className="text-lg font-semibold tracking-[-0.02em]">The payment didn&apos;t go through.</p>
            <p className="mt-2 text-muted">You haven&apos;t been charged for a plan. You can try again from the pricing page.</p>
            <Link href="/pricing" className="btn btn-primary mt-6">Back to plans</Link>
          </>
        )}
        {state === "success" && (
          <>
            <p className="text-lg font-semibold tracking-[-0.02em]">Paid — your plan is active for 30 days.</p>
            {data?.subscription && <p className="mt-2 text-muted">Enjoy making clips.</p>}
            <Link href="/settings/billing" className="btn btn-primary mt-6">Go to billing</Link>
          </>
        )}
      </div>
    </section>
  );
}
