// The public address: SITE_URL once ytclipper.xyz is connected, else Vercel's production URL, else local.
export const SITE = process.env.SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const NAME = "YT-Clipper";

export const DESCRIPTION = "AI clip maker for YouTube videos and podcasts: paste a link, get captioned 9:16 Shorts, TikToks and "
  + "Reels with posts for six platforms and a posting calendar. No watermark, no credits.";

/** Structured data for search engines, rendered as <script type="application/ld+json">. */
export function JsonLd({ data }: { data: object }) {
  // "<" escaped so text inside the data can never close the script tag
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
