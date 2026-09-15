"use client";

import { ArrowSquareOut, CheckCircle, Stack } from "@phosphor-icons/react";
import { network, plural, unusable, usePoll, type Channel } from "@/app/lib";
import { PageHeader } from "@/app/ui";
import { NetworkIcon } from "../../projects/[id]/publish";

export default function IntegrationsPage() {
  const { data: channels, error } = usePoll<Channel[]>("publishing/channels", () => false);
  const ready = channels?.filter((c) => c.usable).length ?? 0;

  return (
    <section>
      <PageHeader title="Publishing">
        Approved clips go out through Buffer. Your social accounts are connected in Buffer, so ClipperAi never sees
        their passwords.
      </PageHeader>

      <div className="card mt-8 flex flex-wrap items-center justify-between gap-6 rounded-3xl p-6 sm:p-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Stack weight="fill" className="size-6" /></span>
          <div className="min-w-0">
            <p className="text-sm text-muted">Buffer</p>
            {channels ? (
              <>
                <p className="flex items-center gap-1.5 text-2xl font-semibold tracking-[-0.03em]">
                  Connected <CheckCircle weight="fill" className="size-5 text-accent" />
                </p>
                <p className="mt-0.5 text-muted">
                  {channels.length === 0 ? "No channels yet." : `${ready} of ${plural(channels.length, "channel")} can post clips.`}
                </p>
              </>
            ) : error ? (
              <>
                <p className="text-2xl font-semibold tracking-[-0.03em]">{error.status === 409 ? "Not connected" : "Can't check the connection"}</p>
                <p role="alert" className="mt-0.5 max-w-prose text-danger">{error.message}</p>
              </>
            ) : (
              <div className="skeleton mt-1 h-8 w-40 motion-safe:animate-pulse" aria-label="Checking Buffer" />
            )}
          </div>
        </div>
        <a href="https://publish.buffer.com" target="_blank" rel="noreferrer" className="btn">
          Open Buffer<ArrowSquareOut weight="bold" className="size-4" />
        </a>
      </div>

      <h2 className="mt-12 text-xl font-semibold tracking-[-0.02em]">Channels</h2>
      {!channels ? (
        <p className="card mt-4 p-5 text-muted">{error ? "Channels show up here once Buffer is connected." : "Loading channels..."}</p>
      ) : channels.length === 0 ? (
        <p className="card mt-4 max-w-prose p-5">
          Connect TikTok, Instagram, YouTube or any other account in Buffer, then reload this page.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {channels.map((channel) => (
            <li key={channel.id} className="card flex items-center gap-4 p-4">
              <NetworkIcon service={channel.service} className={`size-11 ${channel.usable ? "" : "opacity-50"}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{network(channel.service)}</p>
                <p className="truncate text-sm text-muted">{channel.displayName || channel.name}</p>
              </div>
              <span className={`chip max-w-[45%] whitespace-normal py-1 text-right leading-tight ${channel.usable ? "chip-accent" : ""}`}>
                {unusable(channel) || "Ready"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 max-w-prose text-sm text-muted">
        Clips can go to TikTok, Instagram, YouTube, LinkedIn, Facebook and X, each with the post written for that
        network. Posts can be scheduled up to 30 days ahead.
      </p>
    </section>
  );
}
