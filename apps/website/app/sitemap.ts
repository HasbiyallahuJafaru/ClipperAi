import type { MetadataRoute } from "next";
import { COMPETITORS } from "./(site)/compare/data";
import { TOOLS } from "./(site)/tools/data";
import { SITE } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/how-it-works", "/features", "/pricing", "/faq", "/compare",
    ...TOOLS.map((t) => `/tools/${t.slug}`), ...COMPETITORS.map((c) => `/compare/${c.slug}`)];
  return pages.map((path) => ({ url: `${SITE}${path}`, changeFrequency: "monthly", priority: path === "" ? 1 : 0.7 }));
}
