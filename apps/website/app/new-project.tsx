"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, plural, type Project } from "./lib";

const MAX_BYTES = 5 * 1024 ** 3; // storage's single-upload limit; the backend checks it again
type Ticket = { source: string; upload_url: string; headers: Record<string, string> };

/** PUTs the file straight to storage. XMLHttpRequest because fetch can't report upload progress. */
function put(file: File, ticket: Ticket, onProgress: (share: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.upload_url);
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("The upload was rejected. Please try again.")));
    xhr.onerror = () => reject(new Error("The upload stopped. Check your connection and try again."));
    xhr.send(file);
  });
}

const size = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const lines = (text: string) => text.split(/\s+/).filter(Boolean);

/** Start one project per link (one per line) or per uploaded file, all with the same options. */
export function NewProject() {
  const router = useRouter();
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ message: string; needsPlan?: boolean }>();

  function choose(chosen: FileList | null) {
    const list = [...(chosen ?? [])];
    const notVideo = list.find((f) => !f.type.startsWith("video/"));
    if (notVideo) return setError({ message: `${notVideo.name} isn't a video. Choose MP4, MOV or WebM files.` });
    const tooBig = list.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError({ message: `${tooBig.name} is larger than 5 GB.` });
    setError(undefined);
    setFiles((current) => [...current, ...list]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [min, max] = [Number(form.get("min_seconds")), Number(form.get("max_seconds"))];
    if (min > max) return setError({ message: "The shortest clip can't be longer than the longest clip." });
    const sources: (File | string)[] = files.length ? files : lines(links);
    const notLink = sources.find((s) => typeof s === "string" && !/^https?:\/\/\S+$/i.test(s));
    if (notLink) return setError({ message: `"${notLink}" isn't a link. Paste one link per line.` });
    if (!sources.length) return setError({ message: "Paste a link or choose a video." });

    setError(undefined);
    const options = { clips: Number(form.get("clips")) || null, min_seconds: min, max_seconds: max };
    const started: string[] = [];
    try {
      for (const [i, item] of sources.entries()) {
        const of = sources.length > 1 ? ` ${i + 1} of ${sources.length}` : "";
        let source = typeof item === "string" ? item : "";
        if (item instanceof File) {
          setBusy(`Uploading${of}`);
          const ticket = await api<Ticket>("uploads", "POST", { content_type: item.type, size: item.size });
          await put(item, ticket, (share) => setBusy(`Uploading${of}, ${Math.round(share * 100)}%`));
          source = ticket.source;
        } else {
          setBusy(`Starting${of}`);
        }
        started.push((await api<Project>("projects", "POST", { source, ...options })).id);
        // take what has started off the form, so trying again after an error doesn't start it twice
        if (item instanceof File) setFiles((current) => current.filter((f) => f !== item));
        else setLinks((current) => lines(current).filter((link, at, all) => at !== all.indexOf(item)).join("\n"));
      }
      router.push(started.length === 1 ? `/projects/${started[0]}` : "/dashboard");
    } catch (e) {
      const done = started.length ? `Started ${plural(started.length, "project")}. ` : "";
      setError({ message: done + (e as Error).message, needsPlan: (e as { status?: number }).status === 402 });
      setBusy("");
    }
  }

  return (
    <form
      onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!busy) choose(e.dataTransfer.files);
      }}
      className="max-w-2xl"
    >
      <div className="grid gap-2">
        <label htmlFor={files.length ? undefined : "source"} className="text-sm font-medium">
          {files.length ? "Videos" : "Video links"}
        </label>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
          {files.length ? (
            <ul className="input divide-y divide-line py-0">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="truncate">{file.name}</span>
                  <span className="flex shrink-0 items-center gap-4">
                    <span className="tabular-nums text-muted">{size(file.size)}</span>
                    <button type="button" className="link text-sm" disabled={!!busy}
                            onClick={() => setFiles(files.filter((f) => f !== file))}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <textarea id="source" rows={1} value={links} disabled={!!busy}
                      onChange={(e) => setLinks(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      className="input max-h-60 resize-none field-sizing-content"
                      placeholder="https://www.youtube.com/watch?v=..." />
          )}
          <button className="btn btn-primary" disabled={!!busy}>{busy ? `${busy}...` : "Make clips"}</button>
        </div>
        <p className="text-sm text-muted">
          {files.length ? (
            <>
              <label className="link text-ink has-focus-visible:outline-2">
                Add more videos
                <input type="file" accept="video/*" multiple className="sr-only" disabled={!!busy}
                       onChange={(e) => choose(e.target.files)} />
              </label>
              {" or "}
              <button type="button" className="link text-ink" disabled={!!busy} onClick={() => setFiles([])}>
                use links instead
              </button>
            </>
          ) : (
            <>
              Several videos? Put one link per line (Shift+Enter). Or{" "}
              <label className="link text-ink has-focus-visible:outline-2">
                upload videos
                <input type="file" accept="video/*" multiple className="sr-only" disabled={!!busy}
                       onChange={(e) => choose(e.target.files)} />
              </label>
              {" "}up to 5 GB each, or drop them here.
            </>
          )}
        </p>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-danger">
          {error.message}{" "}
          {error.needsPlan && <Link href="/pricing" className="link text-ink">See plans</Link>}
        </p>
      )}

      <details className="mt-8">
        <summary className="link w-fit text-sm text-muted">Options</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="grid content-start gap-2 text-sm font-medium">
            Clips per video
            <input name="clips" type="number" min={1} max={30} placeholder="Automatic" className="input" />
            <span className="font-normal text-muted">About one per 6 minutes if left empty.</span>
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">
            Shortest clip, seconds
            <input name="min_seconds" type="number" min={5} max={180} defaultValue={30} required className="input" />
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">
            Longest clip, seconds
            <input name="max_seconds" type="number" min={5} max={180} defaultValue={60} required className="input" />
          </label>
        </div>
      </details>
    </form>
  );
}
