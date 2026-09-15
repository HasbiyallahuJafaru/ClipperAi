"use client";

import {
  ArrowSquareOut, Broadcast, CheckCircle, Clock, FacebookLogo, InstagramLogo, LinkedinLogo, TiktokLogo, WarningCircle,
  XLogo, YoutubeLogo,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, localInput, network, unusable, when, type Channel, type Clip, type Publication } from "@/app/lib";

export type Channels = { list?: Channel[]; error?: string; load: () => void };

const ICONS: Record<string, typeof TiktokLogo> = {
  tiktok: TiktokLogo, instagram: InstagramLogo, youtube: YoutubeLogo, linkedin: LinkedinLogo, facebook: FacebookLogo, twitter: XLogo,
};

/** A network's logo in a small tile (a generic mark for networks clips can't go to). */
export function NetworkIcon({ service, className = "size-9" }: { service: string; className?: string }) {
  const Icon = ICONS[service] ?? Broadcast;
  return (
    <span className={`grid shrink-0 place-items-center rounded-xl bg-ground text-ink ${className}`}>
      <Icon weight="fill" className="size-[55%]" />
    </span>
  );
}

/** The Buffer channels, loaded the first time a publish form opens and shared by every clip on the page. */
export function useChannels(): Channels {
  const [list, setList] = useState<Channel[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function load() {
    if (list || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      setList(await api<Channel[]>("publishing/channels"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return { list, error, load };
}

/** Still on its way out: worth asking the backend again soon. */
export const waiting = (post: Publication) =>
  post.status === "queued" || post.status === "sending" || (post.status === "scheduled" && new Date(post.due_at!) <= new Date());

/** The Buffer channels as checkboxes named "channel". `reason(channel)` says why one can't be chosen ("" if it can). */
export function ChannelChoices({ channels, reason }: { channels: Channels; reason: (channel: Channel) => string }) {
  if (channels.error) {
    return (
      <p role="alert" className="mt-3 text-danger">
        {channels.error} <Link href="/settings/integrations" className="link text-ink">Publishing settings</Link>
      </p>
    );
  }
  if (!channels.list) {
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Loading channels">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 motion-safe:animate-pulse" />)}
      </div>
    );
  }
  if (channels.list.length === 0) {
    return (
      <p className="mt-3">
        No social accounts are connected in Buffer yet.{" "}
        <a href="https://publish.buffer.com" target="_blank" rel="noreferrer" className="link">Connect one in Buffer</a>,
        then reload this page.
      </p>
    );
  }
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {channels.list.map((channel) => {
        const why = reason(channel);
        return (
          <li key={channel.id}>
            <label className={`flex h-full min-h-16 items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-accent ${why
              ? "cursor-not-allowed" : "cursor-pointer hover:ring-line-strong has-checked:bg-accent-soft/60 has-checked:ring-2 has-checked:ring-accent"}`}>
              <NetworkIcon service={channel.service} className={`size-10 ${why ? "opacity-50" : ""}`} />
              <span className="min-w-0 flex-1">
                <span className={`block font-medium ${why ? "text-muted" : ""}`}>{network(channel.service)}</span>
                <span className="block truncate text-sm text-muted">{channel.displayName || channel.name}</span>
                {why && <span className="block text-sm text-muted">{why}</span>}
              </span>
              <input type="checkbox" name="channel" value={channel.id} disabled={!!why} className="size-4.5 shrink-0" />
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function PublishForm({ projectId, clip, posts, channels, until, onSent, onClose }: {
  projectId: string;
  clip: Clip;
  posts: Publication[];
  channels: Channels;
  until: string | null;
  onSent: () => void;
  onClose: () => void;
}) {
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { channels.load(); }, []); // once, when the form opens

  const taken = new Map(posts.filter((p) => p.status !== "error").map((p) => [p.channel_id, p]));
  const open = channels.list?.filter((c) => c.usable && !taken.has(c.id)) ?? [];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const chosen = form.getAll("channel").map(String);
    if (chosen.length === 0) return setError("Choose at least one channel.");
    setBusy(true);
    setError("");
    try {
      const due_at = later ? new Date(String(form.get("due_at"))).toISOString() : undefined;
      await api(`projects/${projectId}/clips/${clip.idx}/publish`, "POST", { channels: chosen, due_at });
      onSent();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      onSent(); // some channels may have gone through before the problem
    } finally {
      setBusy(false);
    }
  }

  const choice = "flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-xl px-5 text-sm font-medium text-muted transition-colors has-checked:bg-surface has-checked:text-ink has-checked:shadow-card has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:outline-2 has-focus-visible:outline-accent sm:flex-none";

  return (
    <form onSubmit={submit} className="mt-6 grid gap-6 rounded-2xl bg-ground/70 p-4 ring-1 ring-line sm:p-5">
      <fieldset>
        <legend className="font-medium">Where</legend>
        <p className="text-sm text-muted">Each network gets the post written for it.</p>
        <ChannelChoices channels={channels} reason={(channel) => {
          const post = taken.get(channel.id);
          return !post ? unusable(channel)
            : post.status === "sent" || post.status === "sending" ? "Already posted" : "Already scheduled";
        }} />
      </fieldset>

      <fieldset>
        <legend className="font-medium">When</legend>
        <div className="mt-2 flex w-full gap-1 rounded-2xl bg-line/60 p-1 sm:w-fit">
          <label className={choice}>
            <input type="radio" name="when" checked={!later} onChange={() => setLater(false)} className="sr-only" /> Now
          </label>
          <label className={choice}>
            <input type="radio" name="when" checked={later} onChange={() => setLater(true)} disabled={!until} className="sr-only" /> Later
          </label>
        </div>
        {later && until && (
          <label className="mt-4 grid gap-2 text-sm font-medium">
            Date and time
            <input type="datetime-local" name="due_at" required min={localInput(new Date())} max={localInput(new Date(until))}
                   className="input w-fit" />
            <span className="max-w-prose font-normal text-muted">Any time up to {when(until)}.</span>
          </label>
        )}
      </fieldset>

      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy || open.length === 0}>
          {busy ? (later ? "Scheduling..." : "Posting...") : later ? "Schedule" : "Post now"}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

/** `dated`: say when (left out where the time is already shown, as on the calendar). */
function state(post: Publication, dated: boolean) {
  switch (post.status) {
    case "queued": return "Scheduling...";
    case "sending": return "Posting...";
    case "scheduled": return dated ? `Scheduled for ${when(post.due_at!)}` : "Scheduled";
    case "sent": return post.sent_at && dated ? `Posted ${when(post.sent_at)}` : "Posted";
    case "error": return `Didn't post: ${post.error ?? "Buffer didn't say why."}`;
    default: return "Waiting for approval in Buffer";
  }
}

const STATE_ICON = { sent: CheckCircle, error: WarningCircle } as Record<string, typeof Clock>;

/** A clip's posts with their state and actions. `compact`: no heading and no dates, for the calendar. */
export function PostList({ posts, onChange, compact = false }: { posts: Publication[]; onChange: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function remove(post: Publication) {
    if (post.status !== "error" && !confirm(`Unschedule the ${network(post.service)} post? It won't be sent.`)) return;
    setBusy(post.id);
    setError("");
    try {
      await api(`publications/${post.id}`, "DELETE");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
      onChange();
    }
  }

  return (
    <section className={compact ? "mt-3" : "mt-6 border-t border-line pt-5"} aria-label="Posts">
      {!compact && <h4 className="font-medium">Posts</h4>}
      <ul className={`grid gap-2 ${compact ? "" : "mt-3"}`} aria-live="polite">
        {posts.map((post) => {
          const Icon = STATE_ICON[post.status] ?? Clock;
          return (
            <li key={post.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-ground/70 p-2.5 pr-3">
              <NetworkIcon service={post.service} className="size-8 bg-surface" />
              <div className="min-w-0 flex-1 basis-28">
                <p className="truncate text-sm"><span className="font-medium">{network(post.service)}</span> <span className="text-muted">{post.channel_name}</span></p>
                <p className={`flex items-start gap-1.5 text-sm ${post.status === "error" ? "text-danger" : post.status === "sent" ? "text-accent-ink" : "text-muted"}`}>
                  <Icon weight={post.status === "sent" || post.status === "error" ? "fill" : "bold"} className="mt-0.5 size-3.5 shrink-0" />
                  <span className="block">{state(post, !compact)}</span>
                </p>
              </div>
              <span className="flex gap-1 text-sm empty:hidden">
                {post.external_link && (
                  <a href={post.external_link} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm hover:bg-surface">
                    View post<ArrowSquareOut weight="bold" className="size-3.5" />
                  </a>
                )}
                {post.status !== "sent" && post.status !== "sending" && (
                  <button type="button" className="btn btn-ghost btn-sm hover:bg-surface" onClick={() => remove(post)} disabled={busy === post.id}>
                    {busy === post.id ? "Removing..." : post.status === "error" ? "Dismiss" : "Unschedule"}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </section>
  );
}
