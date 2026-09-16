"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/app/lib";
import { PageHeader } from "@/app/ui";

// Where Buffer sends the browser after the consent screen. The code is exchanged through the signed-in API proxy;
// the one-time state ties the browser back to the account that started the connection.
export function OAuthReturn({ code, state, declined }: { code: string; state: string; declined: string }) {
  const [failure, setFailure] = useState(declined ? "You declined the connection in Buffer." : "");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!code || !state) return;
    (async () => {
      try {
        await api("publishing/callback", "POST", { code, state });
        setDone(true);
      } catch (e) {
        setFailure((e as Error).message);
      }
    })();
  }, [code, state]);

  return (
    <section>
      <PageHeader title="Buffer" />
      <div className="card mt-8 max-w-xl rounded-3xl p-7">
        {done ? (
          <>
            <p className="text-lg font-semibold tracking-[-0.02em]">Buffer connected. Your channels are ready to take clips.</p>
            <Link href="/settings/integrations" className="btn btn-primary mt-6">Back to publishing</Link>
          </>
        ) : failure ? (
          <>
            <p className="text-lg font-semibold tracking-[-0.02em]">The connection didn&apos;t go through.</p>
            <p role="alert" className="mt-2 text-muted">{failure}</p>
            <Link href="/settings/integrations" className="btn btn-primary mt-6">Try again</Link>
          </>
        ) : (
          <p className="motion-safe:animate-pulse">Finishing the connection...</p>
        )}
      </div>
    </section>
  );
}
