import { useEffect, useState } from "react";

// Shapes returned by the backend (apps/backend/jobs.py).
export type Status =
  | "queued" | "downloading" | "transcribing" | "analyzing" | "rendering" | "packaging"
  | "completed" | "failed" | "cancelled";
export type Review = "pending" | "approved" | "rejected";
export const PLATFORMS = {
  tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn", facebook: "Facebook", x: "X",
};
export type Platform = keyof typeof PLATFORMS;
export type Posts = Record<Platform, string>;

export type Clip = {
  idx: number;
  start_s: number;
  end_s: number;
  score: number;
  reason: string;
  hook: string;
  title: string;
  description: string;
  hashtags: string[];
  posts: Posts;
  review: Review;
  video_url?: string; // links are missing once the files have expired
  captions_url?: string;
  thumbnail_url?: string;
};

export type Project = {
  id: string;
  source: string;
  status: Status;
  message: string;
  detail: string;
  error: string | null;
  cancel_requested: boolean;
  created_at: string;
  files_expire_at?: string;
  clips?: Clip[]; // single project only
  clip_count?: number; // project list only
};

export type Plan = {
  id: string;
  name: string;
  price_cents: number;
  videos: number | null; // null = no cap
  minutes: number;
  clips: number;
};

export type Subscription = {
  id: string;
  plan: string;
  price_cents: number;
  charged_cents: number;
  status: "active" | "ended";
  started_at: string;
  ended_at: string | null;
};

export type Billing = {
  plans: Plan[];
  subscription: Subscription | null;
  usage: { videos: number; minutes: number; clips: number };
  history: Subscription[];
};

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const hours = (minutes: number) =>
  minutes < 60 ? plural(Math.round(minutes), "minute") : plural(Math.round(minutes / 6) / 10, "hour");

export const planLimits = (plan: Plan) => [
  plan.videos === null ? "Any number of videos" : `${plural(plan.videos, "video")} a month`,
  `${hours(plan.minutes)} of video a month`,
  `${plural(plan.clips, "clip")} a month`,
];

// The steps a project moves through while processing, in order.
export const STEPS: [Status, string][] = [
  ["downloading", "Get the video"],
  ["transcribing", "Listen to it"],
  ["analyzing", "Find the strongest moments"],
  ["rendering", "Create the clips"],
  ["packaging", "Prepare the files"],
];

export const isFinal = (status: Status) => status === "completed" || status === "failed" || status === "cancelled";

/** Calls the backend through this site's /api proxy. Errors carry the backend's message and the HTTP status. */
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.ok) return response.status === 204 ? (undefined as T) : response.json();
  const detail = (await response.json().catch(() => ({}))).detail;
  // FastAPI sends a string, or a list of validation errors like "Value error, source must be on the public internet"
  const text: string = typeof detail === "string" ? detail : detail?.[0]?.msg?.replace(/^Value error, /, "") ?? "";
  const message = text ? text[0].toUpperCase() + text.slice(1) : `Something went wrong (${response.status}).`;
  throw Object.assign(new Error(message), { status: response.status });
}

/** Loads `path`, then reloads it every `ms` while `again(data)` holds. Failed loads retry, except "not found". */
export function usePoll<T>(path: string, again: (data: T) => boolean, ms = 3000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error & { status?: number }>();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    async function load() {
      try {
        const next = await api<T>(path);
        if (stopped) return;
        setData(next);
        setError(undefined);
        if (again(next)) timer = setTimeout(load, ms);
      } catch (e) {
        if (stopped) return;
        setError(e as Error);
        if ((e as { status?: number }).status !== 404) timer = setTimeout(load, ms);
      }
    }
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [path]); // `again` and `ms` are fixed per page, so only a new path restarts polling
  return { data, setData, error };
}

export function sourceLabel(source: string) {
  if (source.startsWith("upload:")) return "Uploaded video";
  const url = new URL(source);
  return url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "") + url.search;
}

export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
