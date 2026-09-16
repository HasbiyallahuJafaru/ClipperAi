// Landing pages for the searches people use to find a tool like this (/tools/<slug>). Keyword picks from OpenSEO,
// US, 2026-09-15: "youtube clip maker" 1.3k/mo KD 8, "youtube shorts maker" 1.3k KD 15, "clip youtube video" 2.9k KD 15,
// "podcast clip generator" 30 KD 0 (high CPC). Every answer is a product fact.
export type Tool = {
  slug: string;
  keyword: string; // the search the page is written for
  title: string; // <title>
  heading: [plain: string, accent: string];
  intro: string;
  questions: [question: string, answer: string][];
};

export const TOOLS: Tool[] = [
  {
    slug: "youtube-clip-maker",
    keyword: "YouTube clip maker",
    title: "YouTube Clip Maker: Clip YouTube Videos Into Shorts With AI",
    heading: ["The YouTube clip maker that ", "finds the clips for you"],
    intro: "Paste a YouTube link. YT-Clipper finds the strongest moments, cuts them to 9:16 with captions and a hook, and writes a post for each platform.",
    questions: [
      ["How do I clip a YouTube video?",
        "Paste the video's link and choose how many clips you want, or let YT-Clipper decide (about one for every two minutes). Your clips are ready to review when processing finishes."],
      ["Can I choose how long the clips are?",
        "Yes. Clips are 30 to 60 seconds by default, and you can set anything from 5 seconds to 3 minutes."],
      ["Do the clips have a watermark?",
        "No. Clips never have a watermark, on any plan."],
      ["Which YouTube videos work best?",
        "Videos where people talk: podcasts, interviews, talks, tutorials and commentary. Clips are picked from what's said, so music or gameplay without speech won't give good clips."],
    ],
  },
  {
    slug: "youtube-shorts-maker",
    keyword: "YouTube Shorts maker",
    title: "YouTube Shorts Maker: Turn Long Videos Into Shorts Automatically",
    heading: ["Turn long videos into ", "YouTube Shorts"],
    intro: "One long video becomes a batch of vertical Shorts with word-by-word captions, the speaker kept in frame, and titles and descriptions written for YouTube.",
    questions: [
      ["How do I turn a YouTube video into Shorts?",
        "Paste the link or upload the file. YT-Clipper transcribes it, picks the moments that stand on their own, and renders each as a 9:16 Short with captions."],
      ["Are the captions accurate?",
        "Captions come word by word from the video's transcript, never made up. You get the caption file too, in the download."],
      ["Can I post the Shorts straight to YouTube?",
        "Yes. Connect your YouTube channel in Buffer, then post a Short now or schedule a whole month of them on the calendar."],
      ["Is my original video stored?",
        "No. Your original video is deleted as soon as processing is done. Clips stay available for 30 days."],
    ],
  },
  {
    slug: "podcast-clip-generator",
    keyword: "podcast clip generator",
    title: "Podcast Clip Generator: AI Clips From Every Episode",
    heading: ["Every podcast episode, ", "a week of clips"],
    intro: "Upload an episode or paste its video link. Get the moments listeners would share, captioned and framed on the speaker, with posts ready for every platform.",
    questions: [
      ["What makes a good podcast clip?",
        "A moment that makes sense on its own: a strong opinion, a story or a clear answer. Every clip shows why it was picked, so you can keep the best and reject the rest."],
      ["Does it work with interviews and several speakers?",
        "Yes. Clips follow the conversation, and the crop keeps a face in frame."],
      ["How long can an episode be?",
        "Uploads can be up to 5 GB. Your plan's monthly minutes decide how much video you can process."],
      ["Can I schedule clips for the whole week?",
        "Yes. Pick your channels, days and times, and the calendar spreads your approved clips across them."],
    ],
  },
];
