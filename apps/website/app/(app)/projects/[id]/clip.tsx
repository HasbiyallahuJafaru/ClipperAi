"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { api, clock, PLATFORMS, type Clip, type Platform, type Posts, type Publication, type Review } from "@/app/lib";
import { PostList, PublishForm, type Channels } from "./publish";

export function ClipReview({ projectId, clip, onChange, posts, channels, until, onPosts }: {
  projectId: string;
  clip: Clip;
  onChange: (clip: Clip) => void;
  posts: Publication[];
  channels: Channels;
  until: string | null;
  onPosts: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>("tiktok");
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function save(changes: Partial<Clip>) {
    setBusy(true);
    setError("");
    try {
      onChange(await api<Clip>(`projects/${projectId}/clips/${clip.idx}`, "PATCH", changes));
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const review = (to: Review) => save({ review: clip.review === to ? "pending" : to }); // pressing again undoes

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name)).trim();
    save({
      title: text("title"),
      description: text("description"),
      hashtags: text("hashtags").split(/\s+/).filter(Boolean),
      posts: Object.fromEntries(Object.keys(PLATFORMS).map((p) => [p, text(p)])) as Posts,
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(clip.posts[platform]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Your browser blocked copying. Select the post and copy it instead.");
    }
  }

  const rejected = clip.review === "rejected";
  const number = String(clip.idx).padStart(2, "0");

  return (
    <div className={`card grid gap-6 rounded-3xl p-4 sm:p-6 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8 ${clip.review === "approved" ? "ring-1 ring-accent/30" : ""}`}>
      <div className={`transition-opacity ${rejected ? "opacity-45" : ""}`}>
        {clip.video_url ? (
          <>
            <video src={clip.video_url} poster={clip.thumbnail_url} controls playsInline preload="none"
                   aria-label={`Clip ${number}: ${clip.title}`}
                   className="aspect-[9/16] w-full max-w-56 rounded-2xl bg-ink object-cover" />
            <p className="mt-3 flex max-w-56 flex-wrap gap-1.5 text-sm" aria-label="Download">
              <a href={clip.video_url} className="chip hover:text-ink">Video</a>
              <a href={clip.captions_url} className="chip hover:text-ink">Captions</a>
              <a href={clip.thumbnail_url} className="chip hover:text-ink">Thumbnail</a>
            </p>
          </>
        ) : (
          <div className="flex aspect-[9/16] w-full max-w-56 items-center justify-center rounded-2xl bg-ground p-6 text-center text-sm text-muted">
            This clip&apos;s video file has expired.
          </div>
        )}
      </div>

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="chip bg-ink text-white">Clip {number}</span>
          <span className="chip">{clock(clip.start_s)} to {clock(clip.end_s)} in the video</span>
          <span className="chip">{Math.round(clip.end_s - clip.start_s)} seconds</span>
          <span className="chip">Score {clip.score}</span>
          {clip.review === "approved" && <span className="chip chip-accent"><Check weight="bold" className="size-3.5" />Approved</span>}
        </p>

        {editing ? (
          <form onSubmit={submitEdit} className="mt-5 grid max-w-2xl gap-5">
            <label className="grid gap-2 text-sm font-medium">
              Title
              <input name="title" defaultValue={clip.title} required maxLength={300} className="input" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Description
              <textarea name="description" defaultValue={clip.description} rows={3} maxLength={5000} className="input" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Hashtags
              <input name="hashtags" defaultValue={clip.hashtags.join(" ")} className="input" />
              <span className="font-normal text-muted">Separate them with spaces.</span>
            </label>
            {Object.entries(PLATFORMS).map(([key, name]) => (
              <label key={key} className="grid gap-2 text-sm font-medium">
                {name} post
                <textarea name={key} defaultValue={clip.posts[key as Platform]} rows={3} className="input" />
              </label>
            ))}
            <p className="text-sm text-muted">The hook is part of the video, so it can&apos;t be changed here.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button>
              <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className={`transition-opacity ${rejected ? "opacity-45" : ""}`}>
            <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-balance sm:text-2xl">{clip.title}</h3>
            {/* shown the way it appears in the video: white caption type on a dark box */}
            <p className="mt-3 w-fit rounded-md bg-ink px-2.5 py-1 font-caption text-sm text-white">{clip.hook}</p>
            <p className="mt-4 max-w-prose">{clip.description}</p>
            <p className="mt-2 max-w-prose text-sm text-muted">{clip.reason}</p>

            <div className="mt-6 rounded-2xl bg-ground p-1.5">
              <div role="group" aria-label="Post for" className="flex gap-1 overflow-x-auto">
                {Object.entries(PLATFORMS).map(([key, name]) => (
                  <button key={key} type="button" aria-pressed={platform === key}
                          onClick={() => { setPlatform(key as Platform); setCopied(false); }}
                          className="min-h-10 shrink-0 rounded-xl px-3.5 text-sm font-medium text-muted transition-colors hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-card">
                    {name}
                  </button>
                ))}
              </div>
              <div className="px-3 pt-3 pb-2">
                <p className="max-w-prose whitespace-pre-line">{clip.posts[platform]}</p>
                <button type="button" className="btn btn-ghost btn-sm -ml-2.5 mt-2 text-accent-ink hover:bg-surface" onClick={copy}>
                  {copied ? <Check weight="bold" className="size-4" /> : <Copy weight="bold" className="size-4" />}
                  {copied ? "Copied" : `Copy ${PLATFORMS[platform]} post`}
                </button>
              </div>
            </div>
          </div>
        )}

        {publishing ? (
          <PublishForm projectId={projectId} clip={clip} posts={posts} channels={channels} until={until}
                       onSent={onPosts} onClose={() => setPublishing(false)} />
        ) : !editing && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
            <button className="btn btn-approve" aria-pressed={clip.review === "approved"} onClick={() => review("approved")} disabled={busy}>
              {clip.review === "approved" ? "Approved" : "Approve"}
            </button>
            <button className="btn" aria-pressed={rejected} onClick={() => review("rejected")} disabled={busy}>
              {rejected ? "Rejected" : "Reject"}
            </button>
            <button className="btn" onClick={() => setEditing(true)} disabled={busy}>Edit</button>
            {clip.review === "approved" && clip.video_url && (
              <button className="btn btn-primary sm:ml-auto" onClick={() => setPublishing(true)} disabled={busy}>Publish</button>
            )}
          </div>
        )}
        {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
        {posts.length > 0 && <PostList posts={posts} onChange={onPosts} />}
      </div>
    </div>
  );
}
