"use client";

import { CalendarBlank, CaretLeft, Check, CheckCircle, DownloadSimple, Prohibit, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, day, isFinal, plural, sourceLabel, STEPS, usePoll, when, type Clip, type Project, type Publications } from "@/app/lib";
import { PageHeader } from "@/app/ui";
import { ClipReview } from "./clip";
import { useChannels, waiting } from "./publish";

const back = <Link href="/dashboard" className="inline-flex items-center gap-1 hover:text-ink"><CaretLeft weight="bold" className="size-3.5" />Projects</Link>;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: project, setData: setProject, error } = usePoll<Project>(`projects/${id}`, (p) => !isFinal(p.status));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    try {
      await run();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const cancel = () => act(async () => setProject(await api<Project>(`projects/${id}/cancel`, "POST")));
  const remove = () => {
    if (!confirm("Delete this project and all of its clips? This can't be undone.")) return;
    act(async () => {
      await api(`projects/${id}`, "DELETE");
      router.push("/dashboard");
    });
  };
  // functional update: "Approve all" saves several clips at once and each must land
  const updateClip = (clip: Clip) =>
    setProject((p) => p && { ...p, clips: p.clips?.map((c) => (c.idx === clip.idx ? { ...c, ...clip } : c)) });

  if (!project) {
    return (
      <section>
        <div className="text-sm text-muted">{back}</div>
        {error?.status === 404 ? (
          <p className="mt-6 text-lg">This project doesn&apos;t exist. It may have been deleted.</p>
        ) : error ? (
          <p role="alert" className="mt-6 text-danger">{error.message}</p>
        ) : (
          <div className="skeleton mt-4 h-10 max-w-sm motion-safe:animate-pulse" aria-label="Loading project" />
        )}
      </section>
    );
  }

  return (
    <article>
      <PageHeader title={sourceLabel(project.source)} back={back}
                  actions={isFinal(project.status)
                    ? <button className="btn" onClick={remove} disabled={busy}>Delete project</button>
                    : <button className="btn" onClick={cancel} disabled={busy || project.cancel_requested}>Cancel</button>}>
        Started {when(project.created_at)}
      </PageHeader>
      {(actionError || error) && <p role="alert" className="mt-4 text-danger">{actionError || error?.message}</p>}

      {project.status === "completed" ? (
        <Results project={project} onClip={updateClip} />
      ) : isFinal(project.status) ? (
        <Ended project={project} />
      ) : (
        <Progress project={project} />
      )}
    </article>
  );
}

function Progress({ project }: { project: Project }) {
  const current = STEPS.findIndex(([status]) => status === project.status); // -1 while waiting in the queue
  return (
    <section className="card mt-8 grid gap-10 rounded-3xl p-6 sm:p-10 md:grid-cols-[1.2fr_1fr]" aria-live="polite">
      <div>
        <span className="relative flex size-3">
          <span className="absolute inset-0 rounded-full bg-accent/40 motion-safe:animate-ping" />
          <span className="relative size-3 rounded-full bg-accent" />
        </span>
        <p className="mt-6 text-3xl leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
          {project.cancel_requested ? "Cancelling..." : project.message}
        </p>
        {project.detail && <p className="mt-3 text-muted">{project.detail[0].toUpperCase() + project.detail.slice(1)}</p>}
        <p className="mt-8 text-sm text-muted">You can close this page. Your clips keep processing.</p>
      </div>
      <ol className="grid content-start">
        {STEPS.map(([status, label], i) => (
          <li key={status} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STEPS.length - 1 && <span className={`absolute top-8 bottom-0 left-[15px] w-0.5 rounded ${i < current ? "bg-accent" : "bg-line"}`} />}
            <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-medium ${i < current ? "bg-accent text-white"
              : i === current ? "bg-accent-soft text-accent-ink ring-2 ring-accent" : "bg-ground text-muted"}`}>
              {i < current ? <Check weight="bold" className="size-4" /> : i + 1}
            </span>
            <span className="flex min-h-8 flex-1 items-center justify-between gap-4">
              <span className={i > current ? "text-muted" : "font-medium"}>{label}</span>
              <span className="text-sm text-muted">{i < current ? "Done" : i === current ? "Now" : ""}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Ended({ project }: { project: Project }) {
  const failed = project.status === "failed";
  return (
    <section className="card mt-8 max-w-2xl rounded-3xl p-6 sm:p-10">
      <span className={`grid size-12 place-items-center rounded-2xl ${failed ? "bg-danger-soft text-danger" : "bg-ground text-muted"}`}>
        {failed ? <WarningCircle weight="fill" className="size-6" /> : <Prohibit weight="bold" className="size-6" />}
      </span>
      <p className="mt-5 text-2xl font-semibold tracking-[-0.03em]">{project.message}</p>
      {project.detail ? (
        <p className="mt-3">
          {project.detail[0].toUpperCase() + project.detail.slice(1)}{" "}
          {project.detail.includes("plan") && <Link href="/pricing" className="link font-medium">See plans</Link>}
        </p>
      ) : failed && (
        <p className="mt-3 text-muted">
          We couldn&apos;t make clips from this video. Check that the link plays in a browser, or upload the file instead.
        </p>
      )}
      {project.error && (
        <details className="mt-6 text-sm text-muted">
          <summary className="link w-fit">Technical details</summary>
          <p className="mt-2 rounded-xl bg-ground p-3 font-mono break-words">{project.error}</p>
        </details>
      )}
      <Link href="/projects/new" className="btn btn-primary mt-8">New project</Link>
    </section>
  );
}

function Results({ project, onClip }: { project: Project; onClip: (clip: Clip) => void }) {
  const clips = project.clips ?? [];
  const pending = clips.filter((c) => c.review === "pending");
  const approved = clips.filter((c) => c.review === "approved").length;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = !!project.files_expire_at && new Date(project.files_expire_at) > new Date();
  // the backend checks with Buffer at most once a minute per post, so polling faster than this gains nothing
  const posts = usePoll<Publications>(`projects/${project.id}/publications`, (d) => d.publications.some(waiting), 20000);
  const channels = useChannels();
  const onCalendar = new Set(posts.data?.publications.filter((p) => p.status !== "error").map((p) => p.clip_idx));
  const unscheduled = clips.some((c) => c.review === "approved" && !onCalendar.has(c.idx));

  async function approveAll() {
    setBusy(true);
    setError("");
    try {
      await Promise.all(pending.map((c) =>
        api<Clip>(`projects/${project.id}/clips/${c.idx}`, "PATCH", { review: "approved" }).then(onClip)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (clips.length === 0) return <p className="card mt-8 rounded-3xl p-10 text-lg">No clips were found in this video.</p>;

  return (
    <section className="mt-8">
      <div className="card flex flex-wrap items-center justify-between gap-5 rounded-3xl p-5 sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
            <CheckCircle weight="fill" className="size-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">{plural(clips.length, "clip")}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {approved === 0 ? "None approved yet." : approved === clips.length ? "All approved." : `${approved} approved.`}{" "}
              {live
                ? `Files are available until ${day(project.files_expire_at!)}. Download all skips rejected clips.`
                : "The video files have expired; the text is still here."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.length > 0 && (
            <button className="btn" onClick={approveAll} disabled={busy}>{busy ? "Approving..." : "Approve all"}</button>
          )}
          {live && unscheduled ? (
            <Link className="btn" href={`/projects/${project.id}/calendar`}>Schedule all</Link>
          ) : !!posts.data?.publications.length && (
            <Link className="btn" href={`/projects/${project.id}/calendar`}><CalendarBlank weight="bold" className="size-4" />Calendar</Link>
          )}
          {live && clips.some((c) => c.review !== "rejected") && (
            <a className="btn btn-primary" href={`/api/projects/${project.id}/package`} download>
              <DownloadSimple weight="bold" className="size-4" />Download all
            </a>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      <ol className="mt-5 grid gap-5">
        {clips.map((clip) => (
          <li key={clip.idx}>
            <ClipReview projectId={project.id} clip={clip} onChange={onClip} channels={channels}
                        posts={posts.data?.publications.filter((p) => p.clip_idx === clip.idx) ?? []}
                        until={posts.data?.schedule_until ?? null} onPosts={posts.reload} />
          </li>
        ))}
      </ol>
    </section>
  );
}
