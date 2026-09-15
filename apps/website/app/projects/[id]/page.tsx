"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, day, isFinal, plural, sourceLabel, STEPS, usePoll, when, type Clip, type Project, type Publications } from "../../lib";
import { ClipReview } from "./clip";
import { useChannels, waiting } from "./publish";

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
      <section className="pt-10">
        <Link href="/dashboard" className="link text-sm text-muted">Projects</Link>
        {error?.status === 404 ? (
          <p className="mt-6 text-lg">This project doesn&apos;t exist. It may have been deleted.</p>
        ) : error ? (
          <p role="alert" className="mt-6 text-danger">{error.message}</p>
        ) : (
          <div className="mt-4 h-9 max-w-sm rounded-md bg-line motion-safe:animate-pulse" aria-label="Loading project" />
        )}
      </section>
    );
  }

  return (
    <article className="pt-10">
      <Link href="/dashboard" className="link text-sm text-muted">Projects</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl tracking-tight sm:text-3xl">{sourceLabel(project.source)}</h1>
          <p className="mt-1 text-sm text-muted">Started {when(project.created_at)}</p>
        </div>
        {isFinal(project.status) ? (
          <button className="btn" onClick={remove} disabled={busy}>Delete project</button>
        ) : (
          <button className="btn" onClick={cancel} disabled={busy || project.cancel_requested}>Cancel</button>
        )}
      </div>
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
    <section className="mt-12 max-w-xl" aria-live="polite">
      <p className="font-display text-3xl leading-tight tracking-tight text-balance sm:text-4xl">
        {project.cancel_requested ? "Cancelling..." : project.message}
      </p>
      {project.detail && <p className="mt-2 text-muted">{project.detail[0].toUpperCase() + project.detail.slice(1)}</p>}
      <ol className="mt-10 grid max-w-sm gap-4">
        {STEPS.map(([status, label], i) => (
          <li key={status} className="flex items-baseline justify-between gap-4">
            <span className={i === current ? "-mx-1.5 bg-highlight px-1.5 text-on-highlight" : i < current ? "" : "text-muted"}>
              {label}
            </span>
            <span className="text-sm text-muted">{i < current ? "Done" : i === current ? "Now" : ""}</span>
          </li>
        ))}
      </ol>
      <p className="mt-10 text-sm text-muted">You can close this page. Your clips keep processing.</p>
    </section>
  );
}

function Ended({ project }: { project: Project }) {
  return (
    <section className="mt-12 max-w-xl">
      <p className="font-display text-3xl tracking-tight">{project.message}</p>
      {project.detail ? (
        <p className="mt-3">
          {project.detail[0].toUpperCase() + project.detail.slice(1)}{" "}
          {project.detail.includes("plan") && <Link href="/pricing" className="link">See plans</Link>}
        </p>
      ) : project.status === "failed" && (
        <p className="mt-3 text-muted">
          We couldn&apos;t make clips from this video. Check that the link plays in a browser, or upload the file instead.
        </p>
      )}
      {project.error && (
        <details className="mt-6 text-sm text-muted">
          <summary className="link w-fit">Technical details</summary>
          <p className="mt-2 font-mono break-words">{project.error}</p>
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

  if (clips.length === 0) return <p className="mt-12 text-lg">No clips were found in this video.</p>;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h2 className="font-display text-3xl tracking-tight">{plural(clips.length, "clip")}</h2>
          <p className="mt-1 text-sm text-muted">
            {approved === 0 ? "None approved yet." : approved === clips.length ? "All approved." : `${approved} approved.`}{" "}
            {live
              ? `Files are available until ${day(project.files_expire_at!)}. Download all skips rejected clips.`
              : "The video files have expired; the text is still here."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.length > 0 && (
            <button className="btn" onClick={approveAll} disabled={busy}>{busy ? "Approving..." : "Approve all"}</button>
          )}
          {live && clips.some((c) => c.review !== "rejected") && (
            <a className="btn btn-primary" href={`/api/projects/${project.id}/package`} download>Download all</a>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      <ol className="divide-y divide-line">
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
