import { Plus } from "@phosphor-icons/react/ssr";

// Every answer is a product fact (engine defaults, storage rules, billing rules, publishing through Buffer, payments
// off). The later ones answer what reviewers most often hold against other clip makers (compare/data.ts).
export const QUESTIONS: [question: string, answer: string][] = [
  ["What videos can I use?",
    "A link to a public video, or files you upload, up to 5 GB each. Podcasts, interviews, talks and webinars work best, because clips are picked from what people say."],
  ["How many clips do I get?",
    "About one for every two minutes of video, between 3 and 30, or the number you choose. Clips are 30 to 60 seconds unless you change it."],
  ["Do clips have a watermark?",
    "No. No clip ever has a watermark, on any plan."],
  ["Does YT-Clipper use credits?",
    "No. Each plan lists how many videos, minutes of video and clips you can make each month, and the Billing page shows exactly what's left."],
  ["What if a video fails or I cancel it?",
    "It doesn't count against your plan. If processing stalls, YT-Clipper picks the job up again automatically, and when something can't work you get a plain explanation of why."],
  ["Why did it pick these clips?",
    "Every clip shows a score and the reason it was chosen. Approve the ones you like and reject the rest: only approved clips can be scheduled or posted, and rejected ones are left out of the download."],
  ["Can I edit what it writes?",
    "Yes. Titles, hooks, descriptions, hashtags and every post can be edited before you approve a clip."],
  ["What if my video already has subtitles?",
    "Turn off Add captions under Options when you start the project. Your clips come out without new captions on top, and you still get a caption file in the download."],
  ["Can I use the clips in another editor?",
    "Yes. Download a ZIP with every clip you haven't rejected, its caption file and thumbnail, and a spreadsheet of titles, descriptions, hashtags and posts."],
  ["Which platforms can I post to?",
    "TikTok, Instagram, YouTube, LinkedIn, Facebook and X, through your own Buffer account. Each one gets a post written for it. Instagram needs a creator or business account."],
  ["Do you keep my videos?",
    "Your original video is deleted as soon as your project is done. Clips and their files stay available for 30 days, so download what you want to keep."],
  ["What happens to my clips if I cancel my plan?",
    "Nothing. Cancelling doesn't delete projects: clips stay downloadable for 30 days after each project finished."],
  ["How do I cancel?",
    "One click on the Billing page. The plan ends straight away, with no calls or forms."],
  ["Do you see my social media passwords?",
    "No. You connect your accounts in Buffer, and YT-Clipper only hands Buffer the clips you approved."],
  ["Is it good for gaming or music videos?",
    "Not yet. YT-Clipper picks moments from what people say, so it's built for talking videos. Gameplay or music without speech won't give good clips."],
  ["What does it cost?",
    "Payments are switched off during early access, so every plan is free for now. No card needed."],
];

export function Faq({ questions = QUESTIONS }: { questions?: [string, string][] }) {
  return (
    <div className="card divide-y divide-line rounded-3xl px-2 sm:px-4">
      {questions.map(([question, answer]) => (
        <details key={question} className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 rounded-xl px-3 text-[17px] font-medium [&::-webkit-details-marker]:hidden">
            <h3 className="text-[17px] font-medium tracking-normal">{question}</h3>
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
