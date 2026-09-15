"use client";

import { FilmStrip, Link as LinkIcon, SlidersHorizontal, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
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
  const [options, setOptions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number }>();

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
    const settings = { clips: Number(form.get("clips")) || null, min_seconds: min, max_seconds: max, captions: form.get("captions") === "on" };
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
        started.push((await api<Project>("projects", "POST", { source, ...settings })).id);
        // take what has started off the form, so trying again after an error doesn't start it twice
        if (item instanceof File) setFiles((current) => current.filter((f) => f !== item));
        else setLinks((current) => lines(current).filter((link, at, all) => at !== all.indexOf(item)).join("\n"));
      }
      router.push(started.length === 1 ? `/projects/${started[0]}` : "/dashboard");
    } catch (e) {
      const done = started.length ? `Started ${plural(started.length, "project")}. ` : "";
      setError({ message: done + (e as Error).message, status: (e as { status?: number }).status });
      setBusy("");
    }
  }

  const picker = (label: string) => (
    <label className={`btn btn-ghost btn-sm -ml-1 has-focus-visible:outline-2 has-focus-visible:outline-accent ${busy ? "pointer-events-none opacity-50" : ""}`}>
      <UploadSimple weight="bold" className="size-4 text-accent" />
      {label}
      <input type="file" accept="video/*" multiple className="sr-only" disabled={!!busy} onChange={(e) => choose(e.target.files)} />
    </label>
  );

  return (
    <form
      onSubmit={submit}
      onInvalidCapture={() => setOptions(true)} // a bad value in closed options would otherwise block silently
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!busy) choose(e.dataTransfer.files);
      }}
      className="w-full text-left"
    >
      <div className={`rounded-[1.25rem] bg-surface p-2 shadow-float ring-1 transition-shadow focus-within:ring-accent/50 ${dragging ? "ring-2 ring-accent" : "ring-line"}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          {files.length ? (
            <ul aria-label="Videos" className="min-w-0 flex-1 divide-y divide-line px-2">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex min-h-11 items-center gap-3 py-1.5">
                  <FilmStrip className="size-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-sm text-muted">{size(file.size)}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} disabled={!!busy}
                          onClick={() => setFiles(files.filter((f) => f !== file))}
                          className="grid size-9 place-items-center rounded-full text-muted hover:bg-ground hover:text-ink">
                    <X weight="bold" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-w-0 flex-1 items-start gap-2.5 px-2">
              <LinkIcon weight="bold" className="mt-3.5 size-5 shrink-0 text-muted" />
              <label htmlFor="source" className="sr-only">Video links</label>
              <textarea id="source" rows={1} value={links} disabled={!!busy}
                        onChange={(e) => setLinks(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                        className="field-sizing-content max-h-60 min-h-12 w-full resize-none bg-transparent py-3 text-base outline-none placeholder:text-[#6b7385]"
                        placeholder="Paste video links, one per line" />
            </div>
          )}
          <button className="btn btn-primary h-12 shrink-0 px-6" disabled={!!busy}>{busy ? `${busy}...` : "Make clips"}</button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-2 pt-2 text-sm text-muted">
          {files.length ? (
            <>
              {picker("Add more videos")}
              <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setFiles([])}>use links instead</button>
            </>
          ) : (
            <>
              {picker("Upload videos")}
              <span className="hidden sm:inline">Up to 5 GB each, or drop them here</span>
            </>
          )}
          <button type="button" aria-expanded={options} onClick={() => setOptions(!options)}
                  className={`btn btn-ghost btn-sm ml-auto ${options ? "text-ink" : "text-muted"}`}>
            <SlidersHorizontal weight="bold" className="size-4" /> Options
          </button>
        </div>

        <div hidden={!options} className="grid gap-4 border-t border-line p-3 pt-4 sm:grid-cols-3">
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
          <label className="flex items-start gap-3 text-sm font-medium sm:col-span-3">
            <input name="captions" type="checkbox" defaultChecked className="mt-0.5 size-4 accent-accent" />
            <span>
              Add captions
              <span className="block font-normal text-muted">Turn off for videos that already have subtitles burned in.</span>
            </span>
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          <WarningCircle weight="fill" className="mt-px size-4 shrink-0" />
          <span>
            {error.message}{" "}
            {error.status === 402 && <Link href="/pricing" className="link font-medium">See plans</Link>}
            {error.status === 401 && <Link href="/sign-up" className="link font-medium">Sign up</Link>}
          </span>
        </p>
      )}
    </form>
  );
}
