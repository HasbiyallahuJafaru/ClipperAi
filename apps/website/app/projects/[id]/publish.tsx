"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, localInput, network, unusable, when, type Channel, type Clip, type Publication } from "../../lib";

export type Channels = { list?: Channel[]; error?: string; load: () => void };

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
      <p role="alert" className="mt-2 text-danger">
        {channels.error} <Link href="/settings/integrations" className="link text-ink">Publishing settings</Link>
      </p>
    );
  }
  if (!channels.list) {
    return (
      <div className="mt-2 grid gap-2" aria-label="Loading channels">
        {[0, 1, 2].map((i) => <div key={i} className="h-9 max-w-sm rounded-md bg-line motion-safe:animate-pulse" />)}
      </div>
    );
  }
  if (channels.list.length === 0) {
    return (
      <p className="mt-2">
        No social accounts are connected in Buffer yet.{" "}
        <a href="https://publish.buffer.com" target="_blank" rel="noreferrer" className="link">Connect one in Buffer</a>,
        then reload this page.
      </p>
    );
  }
  return (
    <ul className="mt-2 grid">
      {channels.list.map((channel) => {
        const why = reason(channel);
        return (
          <li key={channel.id}>
            <label className={`grid min-h-11 grid-cols-[1rem_5.5rem_minmax(0,1fr)] content-center items-center gap-x-3 py-1 sm:grid-cols-[1rem_5.5rem_minmax(0,1fr)_auto] ${why ? "text-muted" : "cursor-pointer"}`}>
              <input type="checkbox" name="channel" value={channel.id} disabled={!!why} className="size-4" />
              <span className={`font-medium ${why ? "" : "text-ink"}`}>{network(channel.service)}</span>
              <span className="truncate">{channel.displayName || channel.name}</span>
              {why && <span className="col-start-3 text-sm sm:col-start-4">{why}</span>}
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

  return (
    <form onSubmit={submit} className="mt-8 grid max-w-2xl gap-6 border-t border-line pt-6">
      <fieldset className="grid gap-1">
        <legend className="text-sm font-medium">Where</legend>
        <p className="text-sm text-muted">Each network gets the post written for it.</p>
        <ChannelChoices channels={channels} reason={(channel) => {
          const post = taken.get(channel.id);
          return !post ? unusable(channel)
            : post.status === "sent" || post.status === "sending" ? "Already posted" : "Already scheduled";
        }} />
      </fieldset>

      <fieldset className="grid gap-1">
        <legend className="text-sm font-medium">When</legend>
        <div className="flex gap-6">
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="radio" name="when" checked={!later} onChange={() => setLater(false)} className="size-4" /> Now
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input type="radio" name="when" checked={later} onChange={() => setLater(true)} disabled={!until} className="size-4" /> Later
          </label>
        </div>
        {later && until && (
          <label className="mt-1 grid gap-2 text-sm font-medium">
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
    <section className={compact ? "mt-2" : "mt-8 max-w-2xl"} aria-label="Posts">
      {!compact && <h4 className="text-sm font-medium">Posts</h4>}
      <ul className={`grid gap-3 sm:gap-2 ${compact ? "" : "mt-2"}`} aria-live="polite">
        {posts.map((post) => (
          <li key={post.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:grid-cols-[5.5rem_minmax(0,9rem)_minmax(0,1fr)_auto]">
            <span className="font-medium">{network(post.service)}</span>
            <span className="truncate text-muted">{post.channel_name}</span>
            <span className={`col-span-2 sm:col-span-1 ${post.status === "error" ? "text-danger" : ""}`}>{state(post, !compact)}</span>
            <span className="col-span-2 flex gap-4 text-sm empty:hidden sm:col-span-1">
              {post.external_link && (
                <a href={post.external_link} target="_blank" rel="noreferrer" className="link inline-flex min-h-11 items-center sm:min-h-0">View post</a>
              )}
              {post.status !== "sent" && post.status !== "sending" && (
                <button type="button" className="link inline-flex min-h-11 items-center sm:min-h-0" onClick={() => remove(post)} disabled={busy === post.id}>
                  {busy === post.id ? "Removing..." : post.status === "error" ? "Dismiss" : "Unschedule"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </section>
  );
}
