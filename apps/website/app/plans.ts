// A copy of apps/backend/billing.py PLANS, so signed-out visitors can see prices (the backend only answers signed-in
// users; the user chose a copy over a public route, 2026-09-15). walkthrough.mjs fails if the two drift apart.
// ponytail: two copies; if prices change often, add a public read-only plans route instead.
export type Plan = {
  id: string;
  name: string;
  price_cents: number;
  videos: number | null; // null = no cap
  minutes: number;
  clips: number;
};

export const PLANS: Plan[] = [
  { id: "creator", name: "Creator", price_cents: 1500, videos: 5, minutes: 300, clips: 50 },
  { id: "pro", name: "Pro", price_cents: 3900, videos: 15, minutes: 900, clips: 150 },
  { id: "business", name: "Business", price_cents: 9900, videos: null, minutes: 3000, clips: 500 },
];
