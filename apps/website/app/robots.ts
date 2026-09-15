import type { MetadataRoute } from "next";
import { SITE } from "./site";

export default function robots(): MetadataRoute.Robots {
  return {
    // signed-in pages and the API proxy have nothing to index
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/projects", "/settings", "/checkout"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
