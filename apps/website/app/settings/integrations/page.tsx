"use client";

import { network, plural, unusable, usePoll, type Channel } from "../../lib";

export default function IntegrationsPage() {
  const { data: channels, error } = usePoll<Channel[]>("publishing/channels", () => false);
  const ready = channels?.filter((c) => c.usable).length ?? 0;

  return (
    <section className="pt-10">
      <h1 className="font-display text-3xl tracking-tight">Publishing</h1>
      <p className="mt-2 max-w-prose text-muted">
        Approved clips go out through Buffer. Your social accounts are connected in Buffer, so ClipperAi never sees
        their passwords.
      </p>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div className="min-w-0">
          <p className="text-sm text-muted">Buffer</p>
          {channels ? (
            <>
              <p className="mt-1 font-display text-2xl tracking-tight">Connected</p>
              <p className="mt-1 text-muted">
                {channels.length === 0 ? "No channels yet." : `${ready} of ${plural(channels.length, "channel")} can post clips.`}
              </p>
            </>
          ) : error ? (
            <>
              <p className="mt-1 font-display text-2xl tracking-tight">{error.status === 409 ? "Not connected" : "Can't check the connection"}</p>
              <p role="alert" className="mt-1 max-w-prose text-danger">{error.message}</p>
            </>
          ) : (
            <div className="mt-2 h-8 w-40 rounded-md bg-line motion-safe:animate-pulse" aria-label="Checking Buffer" />
          )}
        </div>
        <a href="https://publish.buffer.com" target="_blank" rel="noreferrer" className="btn">Open Buffer</a>
      </div>

      <h2 className="mt-10 text-lg font-semibold">Channels</h2>
      {!channels ? (
        <p className="mt-4 text-muted">{error ? "Channels show up here once Buffer is connected." : "Loading channels..."}</p>
      ) : channels.length === 0 ? (
        <p className="mt-4 max-w-prose">
          Connect TikTok, Instagram, YouTube or any other account in Buffer, then reload this page.
        </p>
      ) : (
        <ul className="mt-4 max-w-2xl divide-y divide-line">
          {channels.map((channel) => (
            <li key={channel.id} className="grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-x-6 gap-y-0.5 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
              <span className="font-medium">{network(channel.service)}</span>
              <span className="truncate text-muted">{channel.displayName || channel.name}</span>
              <span className={`col-span-2 sm:col-span-1 ${channel.usable ? "" : "text-muted"}`}>{unusable(channel) || "Ready"}</span>
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
