// Comparison pages (/compare/<slug>). Competitor facts come from their public pricing and from published reviews,
// checked 2026-09-15 (sources listed per page): re-check before changing, prices move. Our side only states what the
// product does today (apps/backend: no watermark, failed videos don't count, 30-day files, reasons, ZIP with captions).
export const CHECKED = "September 2026";

export type Competitor = {
  slug: string;
  name: string;
  pricing: [plan: string, price: string, includes: string][];
  complaints: [complaint: string, answer: string][]; // what reviewers report, and what YT-Clipper does about it
  betterFor: string[]; // honest: when the other tool is the better pick
  sources: [label: string, url: string][];
};

export const COMPETITORS: Competitor[] = [
  {
    slug: "opusclip",
    name: "OpusClip",
    pricing: [
      ["Free", "$0", "60 credits a month, watermarked exports, clips expire after 3 days"],
      ["Starter", "$15 / month", "Monthly billing only"],
      ["Pro", "$29 / month", "$14.50 / month billed yearly"],
      ["Business", "Custom", "No published price"],
    ],
    complaints: [
      ["Credits are confusing, and it's hard to tell what a video will cost before you upload it.",
        "No credits. Each plan lists videos, minutes of video and clips per month, and your usage page shows exactly what's left."],
      ["Projects and paid-for credits disappear when a subscription ends.",
        "Cancelling doesn't touch your projects. Clips, captions and posts stay downloadable for 30 days after each project finishes, whatever your plan."],
      ["Charges after cancelling, and cancelling takes too many steps.",
        "Cancel in one click on the Billing page and the plan ends immediately. During early access nothing is charged at all."],
      ["Free exports carry a watermark.",
        "No watermark on any clip, on any plan."],
      ["Processing fails or stalls on some videos.",
        "Failed and cancelled videos don't count against your plan, and a stalled job is picked up again automatically."],
    ],
    betterFor: [
      "Gaming, sports and other videos where the best moments aren't in what people say.",
      "B-roll, an AI virality score and caption translation into many languages.",
      "Teams that need a large, established tool with a free plan to try first.",
    ],
    sources: [
      ["OpusClip pricing", "https://www.opus.pro/pricing"],
      ["eesel AI: OpusClip reviews", "https://www.eesel.ai/blog/opusclip-reviews"],
      ["Ssemble: Opus Clip review 2026", "https://www.ssemble.com/blog/opus-clip-review-2026"],
      ["quso.ai: Opus Clip pricing", "https://quso.ai/blog/opus-clip-pricing"],
    ],
  },
  {
    slug: "klap",
    name: "Klap",
    pricing: [
      ["Starter", "$29 / month", "10 videos up to 45 minutes each, 100 clips, HD"],
      ["Pro", "$79 / month", "30 videos up to 2 hours each, 300 clips, 4K"],
      ["Pro Plus", "$189 / month", "100 videos up to 3 hours each, 1,000 clips"],
    ],
    complaints: [
      ["No mobile app: it only works in a browser.",
        "A YT-Clipper app for Android and iOS is being built, using the same account, projects and plan."],
      ["You only get the rendered MP4, nothing you can open in another editor.",
        "Download a ZIP with every clip, its caption file, its thumbnail, and a spreadsheet of titles, descriptions, hashtags and posts."],
      ["Clips from tutorials end abruptly or mix two topics.",
        "Clips start and end on word boundaries from the transcript, and each one shows why it was picked, so you can reject the ones that miss."],
    ],
    betterFor: [
      "4K exports on its higher plans.",
      "Reframing that follows several people on screen.",
    ],
    sources: [
      ["G2: Klap pricing", "https://www.g2.com/products/klap/pricing"],
      ["Cybernews: Klap AI review", "https://cybernews.com/ai-tools/klap-ai-review/"],
      ["quso.ai: Klap review", "https://quso.ai/blog/klap-ai-review-pros-cons-alternatives"],
    ],
  },
  {
    slug: "vizard",
    name: "Vizard",
    pricing: [
      ["Free", "$0", "120 upload minutes a month, 10 exports"],
      ["Creator", "$14.50 / month", "Billed yearly; about $29 billed monthly"],
      ["Business", "$19.50 / month", "Billed yearly; team features and brand kits"],
    ],
    complaints: [
      ["The AI doesn't always pick the best moments.",
        "Every clip comes with a score and the reason it was picked. Approve the good ones and reject the rest: only approved clips can be posted or scheduled."],
      ["You have to keep paying to hold on to unused credits.",
        "No credits to hoard. Your plan is a simple monthly allowance, and failed or cancelled videos give it back."],
      ["Long videos are slow to process.",
        "Processing runs in the background with a live progress bar. Close the page and come back when your clips are ready."],
    ],
    betterFor: [
      "Trying the product on a free plan before choosing a paid one.",
      "Editing clips on a timeline inside the tool.",
    ],
    sources: [
      ["Vizard pricing (Capterra)", "https://www.capterra.com/p/10009818/Vizard/pricing/"],
      ["Trustpilot: Vizard reviews", "https://www.trustpilot.com/review/vizard.ai"],
      ["G2: Vizard pros and cons", "https://www.g2.com/products/vizard-corp-vizard/reviews?qs=pros-and-cons"],
    ],
  },
  {
    slug: "submagic",
    name: "Submagic",
    pricing: [
      ["Free", "$0", "3 videos, watermarked"],
      ["Starter", "$19 / month", "$12 / month billed yearly, per member"],
      ["Pro", "$39 / month", "$23 / month billed yearly, per member"],
      ["Business", "$69 / month", "$41 / month billed yearly, includes the API"],
    ],
    complaints: [
      ["Yearly plans renew without a reminder, and refunds are hard to get.",
        "During early access nothing is charged, so nothing renews. You can cancel any plan in one click on the Billing page, and it ends straight away."],
      ["Pricing is per team member.",
        "Plans belong to your account or your team's workspace, not to each seat."],
      ["It's mainly a captioning tool: you still have to find the clips yourself.",
        "YT-Clipper finds the moments for you, then writes the captions, hooks, titles and a post for each platform, and schedules them."],
    ],
    betterFor: [
      "Highly styled animated captions, emojis and sound effects.",
      "Adding captions to short videos you've already cut yourself.",
    ],
    sources: [
      ["CutSnap: Submagic pricing 2026", "https://cutsnap.ai/blog/submagic-pricing-2026"],
      ["Trustpilot: Submagic reviews", "https://www.trustpilot.com/review/submagic.co"],
    ],
  },
];

// What YT-Clipper does, one row per question buyers ask across every comparison.
export const OURS: [question: string, answer: string][] = [
  ["Watermark", "None, on every plan"],
  ["How usage is counted", "Videos, minutes of video and clips per month. No credits"],
  ["Failed or cancelled videos", "Don't count against your plan"],
  ["How long files are kept", "30 days after each project finishes, even if you cancel"],
  ["Why a clip was picked", "Shown on every clip, with a score"],
  ["Captions", "Word by word from the transcript, with a caption file in the download"],
  ["Posts", "Written for TikTok, Instagram, YouTube, LinkedIn, Facebook and X"],
  ["Scheduling", "Content calendar and publishing through your own Buffer account"],
  ["Your original video", "Deleted as soon as processing is done"],
];
