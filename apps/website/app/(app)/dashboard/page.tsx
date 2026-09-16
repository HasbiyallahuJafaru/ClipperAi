"use client";

import { CaretRight, FilmSlate, Link as LinkIcon, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { isFinal, plural, sourceLabel, usePoll, when, type Project } from "@/app/lib";
import { PageHeader, ProgressBar } from "@/app/ui";

function State({ project }: { project: Project }) {
  if (project.status === "completed") return <span className="chip chip-accent">{plural(project.clip_count ?? 0, "clip")} ready</span>;
  if (project.status === "failed") return <span className="chip chip-danger"><WarningCircle weight="fill" className="size-3.5" />{project.message}</span>;
  if (isFinal(project.status)) return <span className="chip">{project.message}</span>;
  return (
    <span className="chip bg-surface text-ink ring-1 ring-line">
      <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" /> {project.message}
    </span>
  );
}

export default function Dashboard() {
  const { data: projects, error } = usePoll<Project[]>("projects", (list) => list.some((p) => !isFinal(p.status)), 5000);

  return (
    <section>
      <PageHeader title="Projects">Every video you&apos;ve turned into clips, newest first.</PageHeader>

      {error && <p role="alert" className="mt-6 text-danger">{error.message}</p>}

      {!projects ? (
        !error && (
          <div className="card mt-8 grid gap-px overflow-hidden" aria-label="Loading projects">
            {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-surface p-5"><div className="skeleton h-5 max-w-sm motion-safe:animate-pulse" /></div>)}
          </div>
        )
      ) : projects.length === 0 ? (
        <div className="card mt-8 grid justify-items-center rounded-3xl px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent"><FilmSlate weight="fill" className="size-7" /></span>
          <p className="mt-5 text-xl font-semibold tracking-[-0.02em]">No projects yet.</p>
          <p className="mt-1.5 text-muted">Paste a link or upload a video to make your first clips.</p>
          <Link href="/projects/new" className="btn btn-primary mt-6">New project</Link>
        </div>
      ) : (
        <ul className="card mt-8 divide-y divide-line overflow-hidden">
          {projects.map((p) => {
            const Icon = p.source.startsWith("upload:") ? UploadSimple : LinkIcon;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-ground/70 sm:px-5">
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail
                    <img src={p.thumbnail} alt="" className="h-11 w-[4.9rem] shrink-0 rounded-xl bg-ground object-cover" />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ground text-muted group-hover:bg-surface">
                      <Icon weight="bold" className="size-5" />
                    </span>
                  )}
                  <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{sourceLabel(p)}</span>
                      <span className="text-sm text-muted">{when(p.created_at)}</span>
                    </span>
                    <span className="grid gap-2 sm:justify-items-end">
                      <State project={p} />
                      {!isFinal(p.status) && <ProgressBar value={p.progress ?? 0} className="w-full sm:w-40" />}
                    </span>
                  </span>
                  <CaretRight weight="bold" className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
