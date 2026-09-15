import { Plus } from "@phosphor-icons/react/ssr";

// Every answer is a product fact (engine defaults, storage rules, publishing through Buffer, payments off).
const QUESTIONS = [
  ["What videos can I use?",
    "A link to a public video, or files you upload, up to 5 GB each. Podcasts, interviews, talks and webinars work best, because clips are picked from what people say."],
  ["How many clips do I get?",
    "About one for every six minutes of video, between 3 and 30, or the number you choose. Clips are 30 to 60 seconds unless you change it."],
  ["Can I edit what it writes?",
    "Yes. Titles, descriptions, hashtags and every post can be edited before you approve a clip. The hook is part of the video, so it stays as it is."],
  ["Which platforms can I post to?",
    "TikTok, Instagram, YouTube, LinkedIn, Facebook and X, through your own Buffer account. Each one gets a post written for it. Instagram needs a creator or business account."],
  ["Do you keep my videos?",
    "Your original video is deleted as soon as your project is done. Clips and their files stay available for 30 days, so download what you want to keep."],
  ["Do you see my social media passwords?",
    "No. You connect your accounts in Buffer, and ClipperAi only hands Buffer the clips you approved."],
  ["What does it cost?",
    "Payments are switched off during early access, so every plan is free for now. No card needed."],
];

export function Faq() {
  return (
    <div className="card divide-y divide-line rounded-3xl px-2 sm:px-4">
      {QUESTIONS.map(([question, answer]) => (
        <details key={question} className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 rounded-xl px-3 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
            {question}
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ground text-muted transition-transform duration-300 group-open:rotate-45 group-open:bg-accent group-open:text-white">
              <Plus weight="bold" className="size-4" />
            </span>
          </summary>
          <p className="max-w-[62ch] px-3 pb-6 text-muted">{answer}</p>
        </details>
      ))}
    </div>
  );
}
