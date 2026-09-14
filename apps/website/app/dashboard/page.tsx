"use client";

import Link from "next/link";
import { isFinal, plural, sourceLabel, usePoll, when, type Project } from "../lib";

export default function Dashboard() {
  const { data: projects, error } = usePoll<Project[]>("projects", (list) => list.some((p) => !isFinal(p.status)), 5000);

  return (
    <section className="pt-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight">Projects</h1>
        <Link href="/projects/new" className="btn btn-primary">New project</Link>
      </div>

      {error && <p role="alert" className="mt-6 text-danger">{error.message}</p>}

      {!projects ? (
        !error && (
          <div className="mt-8 grid gap-6 border-t border-line pt-6" aria-label="Loading projects">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 max-w-md rounded-md bg-line motion-safe:animate-pulse" />)}
          </div>
        )
      ) : projects.length === 0 ? (
        <div className="mt-8 border-t border-line pt-10">
          <p className="text-lg">No projects yet.</p>
          <p className="mt-1 text-muted">Paste a link or upload a video to make your first clips.</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line border-t border-line">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`}
                    className="group grid gap-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-8">
                <span className="min-w-0">
                  <span className="block truncate font-medium group-hover:underline">{sourceLabel(p.source)}</span>
                  <span className="text-sm text-muted">{when(p.created_at)}</span>
                </span>
                <span className={`text-sm ${p.status === "failed" ? "text-danger" : isFinal(p.status) ? "text-muted" : ""}`}>
                  {p.status === "completed" ? `${plural(p.clip_count ?? 0, "clip")} ready` : p.message}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
