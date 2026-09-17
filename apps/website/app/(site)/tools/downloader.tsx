"use client";
// The free YouTube downloader: paste a link, watch it fetch, download. No sign-in, no plan, nothing tracked as usage.
import { DownloadSimple, YoutubeLogo } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, clock } from "../../lib";

type Format = { id: string; height: number | null; ext: string; bytes: number | null };
type Start = { token: string };
type Status = {
  status: "fetching" | "ready" | "served" | "error";
  progress: number;
  title: string | null;
  duration: number | null;
  thumbnail: string | null;
  formats?: Format[];
  error?: string;
};

export function Downloader() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState<string>();
  const [result, setResult] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // poll the backend while it fetches; stops once the status is final
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    async function poll() {
      try {
        const next = await api<Status>(`tools/download/status?token=${token}`);
        if (stopped) return;
        setResult((current) => current?.status === "ready" ? current : next);
        if (next.status === "fetching") timer.current = setTimeout(poll, 1200);
      } catch (e) {
        if (!stopped) {
          setResult({ status: "error", progress: 0, title: null, duration: null, thumbnail: null,
                      error: (e as Error).message });
        }
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer.current); };
  }, [token]);

  async function lookUp() {
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      setToken((await api<Start>("tools/download", "POST", { url: url.trim() })).token);
    } catch (e) {
      setError((e as Error).message);
      setToken(undefined);
    } finally {
      setBusy(false);
    }
  }

  const fetching = result?.status === "fetching";

  return (
    <div className="mx-auto max-w-2xl">
      <form className="card flex items-center gap-2 rounded-2xl p-2 pl-5 shadow-card" onSubmit={(e) => { e.preventDefault(); if (url.trim() && !busy) lookUp(); }}>
        <YoutubeLogo weight="fill" className="size-6 shrink-0 text-accent" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" required
               placeholder="Paste a YouTube link" aria-label="YouTube link"
               className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        <button type="submit" disabled={busy || fetching || !url.trim()} className="btn btn-primary h-11 shrink-0 px-5 disabled:opacity-50">
          {busy ? "Starting…" : fetching ? "Fetching…" : "Download my video"}
        </button>
      </form>
      {error && <p className="mt-3 text-center text-[15px] font-medium text-red-600">{error}</p>}
      {fetching && (
        <div className="card mt-4 rounded-2xl p-5 shadow-card" role="progressbar" aria-valuenow={result!.progress}
             aria-valuemin={0} aria-valuemax={100}>
          <div className="flex items-center justify-between text-[13px] font-medium text-muted">
            <span>{result!.title ? `Fetching “${result!.title}”…` : "Fetching the video from YouTube…"}</span>
            <span>{result!.progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ground">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${result!.progress}%` }} />
          </div>
        </div>
      )}
      {result?.status === "ready" && (
        <div className="card mt-4 rounded-2xl p-4 text-center shadow-card sm:text-left">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            {result.thumbnail
              ? <img src={result.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />
              : <YoutubeLogo weight="fill" className="size-12 shrink-0 text-accent" />}
            <div className="min-w-0">
              <p className="font-medium sm:truncate">{result.title}</p>
              {result.duration != null && <p className="text-[13px] text-muted">{clock(result.duration)}</p>}
            </div>
            <a className="btn btn-primary h-10 w-full px-5 sm:ml-auto sm:w-auto" rel="noopener"
               href={`/api/tools/download?token=${token}`}>
              <DownloadSimple weight="bold" className="size-4" />
              Download MP4{result.formats?.[0]?.height ? ` · ${result.formats[0].height}p` : ""}
              {result.formats?.[0]?.bytes != null && <span className="font-normal opacity-75"> · {Math.round(result.formats[0].bytes / 1e6)} MB</span>}
            </a>
          </div>
          <p className="mt-3 text-[13px] text-muted">Free, no sign-up. Want clips from it instead?{" "}
            <Link href="/" className="font-medium text-accent-ink underline underline-offset-2">Try the clip maker</Link>
          </p>
        </div>
      )}
      {result?.status === "error" && (
        <p className="card mt-4 rounded-2xl p-4 text-center text-[15px] font-medium text-red-600 shadow-card">{result.error}</p>
      )}
    </div>
  );
}
