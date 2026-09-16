"use client";

import { ArrowSquareOut, CheckCircle, Stack } from "@phosphor-icons/react";
import { api, network, plural, unusable, usePoll, type Channel } from "@/app/lib";
import { PageHeader } from "@/app/ui";
import { NetworkIcon } from "../../projects/[id]/publish";

type Connection = { id: string; provider: string; account_name: string; created_at: string };

export default function IntegrationsPage() {
  const { data: channels, error, setData: setChannels } = usePoll<Channel[]>("publishing/channels", () => false);
  const { data: connection, setData: setConnection } = usePoll<Connection | null>("publishing/connection", () => false);
  const ready = channels?.filter((c) => c.usable).length ?? 0;

  async function connect() {
    const { authorization_url } = await api<{ authorization_url: string }>("publishing/connect/buffer", "POST");
    window.location.href = authorization_url; // Buffer's consent page; it comes back to /oauth/return
  }

  async function disconnect() {
    if (!confirm("Disconnect your Buffer account? Scheduled posts stay, but new ones need a connection again.")) return;
    await api("publishing/connection", "DELETE");
    setConnection(null);
    setChannels(await api<Channel[]>("publishing/channels"));
  }

  return (
    <section>
      <PageHeader title="Publishing">
        Approved clips go out through Buffer. You connect your own Buffer account, so YT-Clipper never sees your
        social passwords and posts through your channels.
      </PageHeader>

      <div className="card mt-8 flex flex-wrap items-center justify-between gap-6 rounded-3xl p-6 sm:p-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-white"><Stack weight="fill" className="size-6" /></span>
          <div className="min-w-0">
            <p className="text-sm text-muted">Buffer</p>
            {connection === undefined ? (
              <div className="skeleton mt-1 h-8 w-40 motion-safe:animate-pulse" aria-label="Checking Buffer" />
            ) : connection ? (
              <>
                <p className="flex items-center gap-1.5 text-2xl font-semibold tracking-[-0.03em]">
                  Connected <CheckCircle weight="fill" className="size-5 text-accent" />
                </p>
                <p className="mt-0.5 text-muted">
                  {channels ? (channels.length === 0 ? "No channels yet." : `${ready} of ${plural(channels.length, "channel")} can post clips.`) : "Your channels load below."}
                </p>
              </>
            ) : error ? (
              <>
                <p className="text-2xl font-semibold tracking-[-0.03em]">Not connected</p>
                <p role="alert" className="mt-0.5 max-w-prose text-danger">{error.message}</p>
              </>
            ) : (
              <p className="text-2xl font-semibold tracking-[-0.03em]">Not connected</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="https://publish.buffer.com" target="_blank" rel="noreferrer" className="btn">
            Open Buffer<ArrowSquareOut weight="bold" className="size-4" />
          </a>
          {connection ? (
            <button className="btn" onClick={disconnect}>Disconnect</button>
          ) : (
            <button className="btn btn-primary" onClick={connect}>Connect Buffer</button>
          )}
        </div>
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
