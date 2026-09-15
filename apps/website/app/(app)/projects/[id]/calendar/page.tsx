"use client";

import { CalendarBlank, CaretLeft, Plus, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  api, localInput, network, plural, sourceLabel, unusable, usePoll,
  type CalendarPlan, type CalendarRequest, type Project, type Publication, type Publications,
} from "@/app/lib";
import { PageHeader } from "@/app/ui";
import { ChannelChoices, PostList, useChannels, waiting, type Channels } from "../publish";

// 1 = Monday to 7 = Sunday, as the backend counts; 1 January 2024 was a Monday. Names in the viewer's language.
const DAYS = [1, 2, 3, 4, 5, 6, 7].map((n) => [n, new Date(2024, 0, n).toLocaleDateString(undefined, { weekday: "short" })] as const);
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { timeStyle: "short" });
const clipName = (idx: number) => `Clip ${String(idx).padStart(2, "0")}`;
const postTime = (post: Publication) => post.due_at ?? post.created_at;

/** Items grouped by the viewer's calendar day, earliest first. */
function byDay<T>(items: T[], at: (item: T) => string): [string, T[]][] {
  const days = new Map<string, T[]>();
  for (const item of [...items].sort((a, b) => Date.parse(at(a)) - Date.parse(at(b)))) {
    days.set(dayLabel(at(item)), [...(days.get(dayLabel(at(item))) ?? []), item]);
  }
  return [...days];
}

function Day({ label, children }: { label: string; children: React.ReactNode }) {
  const [weekday, ...date] = label.split(" ");
  return (
    <li className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:p-5">
      <h3 className="flex items-baseline gap-2 sm:grid sm:content-start sm:gap-0">
        <span className="text-sm font-medium text-muted">{weekday.replace(",", "")}</span>
        <span className="text-lg font-semibold tracking-[-0.02em]">{date.join(" ")}</span>
      </h3>
      <ul className="grid gap-3">{children}</ul>
    </li>
  );
}

function Entry({ at, clip, title, children }: { at: string; clip: number; title?: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-baseline gap-x-3">
      <span className="text-sm font-medium text-accent-ink">{timeLabel(at)}</span>
      <div className="min-w-0">
        <p className="truncate"><span className="font-medium">{clipName(clip)}</span> <span className="text-muted">{title}</span></p>
        {children}
      </div>
    </li>
  );
}

export default function CalendarPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, error } = usePoll<Project>(`projects/${id}`, () => false);
  // queued posts reach Buffer within seconds, so look again soon while any are on their way
  const posts = usePoll<Publications>(`projects/${id}/publications`, (d) => d.publications.some(waiting), 5000);
  const channels = useChannels();
  useEffect(() => { channels.load(); }, []); // once

  if (!project || !posts.data) {
    return (
      <section>
        <Link href={`/projects/${id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><CaretLeft weight="bold" className="size-3.5" />Project</Link>
        {error?.status === 404 ? (
          <p className="mt-6 text-lg">This project doesn&apos;t exist. It may have been deleted.</p>
        ) : error || posts.error ? (
          <p role="alert" className="mt-6 text-danger">{(error ?? posts.error)?.message}</p>
        ) : (
          <div className="skeleton mt-4 h-10 max-w-sm motion-safe:animate-pulse" aria-label="Loading calendar" />
        )}
      </section>
    );
  }

  const all = posts.data.publications;
  const live = !!project.files_expire_at && new Date(project.files_expire_at) > new Date();
  const approved = (project.clips ?? []).filter((c) => c.review === "approved");
  const onCalendar = new Set(all.filter((p) => p.status !== "error").map((p) => p.clip_idx));
  const open = approved.filter((c) => !onCalendar.has(c.idx)).length;
  const titles = new Map(project.clips?.map((c) => [c.idx, c.title]));

  return (
    <article>
      <PageHeader title="Calendar"
                  back={<Link href={`/projects/${id}`} className="inline-flex max-w-full items-center gap-1 hover:text-ink"><CaretLeft weight="bold" className="size-3.5 shrink-0" /><span className="truncate">{sourceLabel(project.source)}</span></Link>}>
        Spread your approved clips over the coming weeks. Buffer posts each one at its time, with the post written for
        each network.
      </PageHeader>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {!live ? (
          <p className="card rounded-3xl p-6 sm:p-8">This project&apos;s video files have expired, so its clips can&apos;t be scheduled any more.</p>
        ) : open === 0 ? (
          <p className="card rounded-3xl p-6 sm:p-8">
            {approved.length > 0 ? "Every approved clip is on the calendar." : "No clips are approved yet."}{" "}
            <Link href={`/projects/${id}`} className="link font-medium">Review clips</Link> to add more.
          </p>
        ) : (
          <ScheduleForm projectId={id} count={open} channels={channels} onScheduled={posts.reload} />
        )}

        <section className="card overflow-hidden rounded-3xl" aria-labelledby="calendar-list">
          <h2 id="calendar-list" className="flex items-center gap-2 border-b border-line px-5 py-4 text-lg font-semibold tracking-[-0.02em]">
            <CalendarBlank weight="bold" className="size-5 text-accent" /> Scheduled and posted
          </h2>
          {all.length === 0 ? (
            <p className="px-5 py-10 text-center text-muted">Nothing yet. Scheduled posts show up here, day by day.</p>
          ) : (
            <ol className="divide-y divide-line">
              {byDay(all, postTime).map(([day, dayPosts]) => {
                const entries = new Map<string, Publication[]>(); // one entry per time and clip, its channels below
                for (const post of dayPosts) {
                  const key = `${timeLabel(postTime(post))} ${post.clip_idx}`; // posts sent "now" differ by seconds
                  entries.set(key, [...(entries.get(key) ?? []), post]);
                }
                return (
                  <Day key={day} label={day}>
                    {[...entries].map(([key, [first, ...rest]]) => (
                      <Entry key={key} at={postTime(first)} clip={first.clip_idx} title={titles.get(first.clip_idx)}>
                        <PostList compact posts={[first, ...rest]} onChange={posts.reload} />
                      </Entry>
                    ))}
                  </Day>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </article>
  );
}

function ScheduleForm({ projectId, count, channels, onScheduled }: {
  projectId: string;
  count: number;
  channels: Channels;
  onScheduled: () => void;
}) {
  const [times, setTimes] = useState(["09:00"]);
  const [plan, setPlan] = useState<CalendarPlan & { request: CalendarRequest }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function preview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const request: CalendarRequest = {
      channels: form.getAll("channel").map(String), days: form.getAll("day").map(Number), times,
      start: String(form.get("start")), timezone: zone,
    };
    if (request.channels.length === 0) return setError("Choose at least one channel.");
    if (request.days.length === 0) return setError("Choose at least one day.");
    run(async () => setPlan({ ...(await api<CalendarPlan>(`projects/${projectId}/calendar/plan`, "POST", request)), request }));
  }

  const schedule = () => run(async () => {
    try {
      await api(`projects/${projectId}/calendar`, "POST", plan!.request);
      setPlan(undefined);
    } finally {
      onScheduled();
    }
  });

  const changeTimes = (next: string[]) => {
    setTimes(next);
    setPlan(undefined);
  };
  const where = plan && channels.list?.filter((c) => plan.request.channels.includes(c.id)).map((c) => network(c.service)).join(", ");

  return (
    <section className="card rounded-3xl p-5 sm:p-7" aria-labelledby="schedule">
      <h2 id="schedule" className="text-xl font-semibold tracking-[-0.02em]">Schedule {plural(count, "approved clip")}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        One clip at each posting time, in clip order, up to 30 days ahead. Times a channel already has a post at are skipped.
      </p>

      <form onSubmit={preview} onChange={() => setPlan(undefined)} className="mt-6 grid gap-7">
        <fieldset>
          <legend className="font-medium">Where</legend>
          <p className="text-sm text-muted">Each network gets the post written for it.</p>
          <ChannelChoices channels={channels} reason={unusable} />
        </fieldset>

        <fieldset>
          <legend className="font-medium">Days</legend>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DAYS.map(([n, name]) => (
              <label key={n} className="flex min-h-11 min-w-14 cursor-pointer items-center justify-center rounded-full px-3.5 font-medium ring-1 ring-line-strong transition-colors select-none hover:bg-ground has-checked:bg-accent has-checked:text-white has-checked:ring-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
                <input type="checkbox" name="day" value={n} defaultChecked={[1, 3, 5].includes(n)} className="sr-only" />
                {name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-7 sm:grid-cols-2">
          <fieldset>
            <legend className="font-medium">Times</legend>
            <p className="text-sm text-muted">In your time zone, {zone.replaceAll("_", " ")}.</p>
            <ul className="mt-3 grid gap-2">
              {times.map((time, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input type="time" required value={time} aria-label={`Posting time ${i + 1}`} className="input w-36"
                         onChange={(e) => changeTimes(times.map((old, j) => (j === i ? e.target.value : old)))} />
                  {times.length > 1 && (
                    <button type="button" aria-label={`Remove posting time ${i + 1}`}
                            className="grid size-11 place-items-center rounded-full text-muted hover:bg-ground hover:text-ink"
                            onClick={() => changeTimes(times.filter((_, j) => j !== i))}><X weight="bold" className="size-4" /></button>
                  )}
                </li>
              ))}
            </ul>
            {times.length < 6 && (
              <button type="button" className="btn btn-ghost btn-sm -ml-2 mt-2 text-accent-ink"
                      onClick={() => changeTimes([...times, "18:00"])}><Plus weight="bold" className="size-4" />Add a time</button>
            )}
          </fieldset>

          <label className="grid content-start gap-2 font-medium">
            Starting
            <input type="date" name="start" required className="input w-44"
                   defaultValue={localInput(new Date(Date.now() + 86400000)).slice(0, 10)} min={localInput(new Date()).slice(0, 10)} />
          </label>
        </div>

        <div>
          <button className={`btn ${plan ? "" : "btn-primary"}`} disabled={busy || !channels.list?.some((c) => c.usable)}>
            {busy && !plan ? "Planning..." : "Preview"}
          </button>
        </div>
      </form>

      {plan && (
        <div className="mt-8 border-t border-line pt-6" aria-live="polite">
          <h3 className="font-medium">Preview</h3>
          <ol className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-ground/70">
            {byDay(plan.posts, (post) => post.due_at).map(([day, list]) => (
              <Day key={day} label={day}>
                {list.map((post) => (
                  <Entry key={post.clip_idx} at={post.due_at} clip={post.clip_idx} title={post.title}>
                    <p className="text-sm text-muted">{where}</p>
                  </Entry>
                ))}
              </Day>
            ))}
          </ol>
          {plan.left.length > 0 && (
            <p className="mt-4 max-w-prose">
              {plan.left.map(clipName).join(", ")} {plan.left.length === 1 ? "doesn't" : "don't"} fit in the next 30
              days. Add days or times, or schedule {plan.left.length === 1 ? "it" : "them"} later.
            </p>
          )}
          <button className="btn btn-primary mt-6" onClick={schedule} disabled={busy}>
            {busy ? "Scheduling..." : `Schedule ${plural(plan.posts.length * plan.request.channels.length, "post")}`}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
    </section>
  );
}
