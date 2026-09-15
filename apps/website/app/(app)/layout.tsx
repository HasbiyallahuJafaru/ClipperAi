import { UserButton } from "@clerk/nextjs";
import { Plus } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Logo } from "../ui";
import { AppNav } from "./nav";

/** Signed-in pages. One bar that is a sidebar from lg up and a top bar with a scrolling nav row below that. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line bg-surface/85 px-4 pt-3 backdrop-blur-xl lg:h-dvh lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-y-1 lg:border-r lg:border-b-0 lg:bg-surface lg:px-3 lg:py-5">
        <Logo className="mr-auto lg:mr-0 lg:mb-5 lg:px-2.5" />
        <Link href="/projects/new" className="btn btn-primary btn-sm lg:mb-4 lg:min-h-10">
          <Plus weight="bold" className="size-4" /> New project
        </Link>
        <span className="grid size-9 place-items-center lg:order-last lg:mt-auto lg:justify-items-start lg:px-2.5">
          <UserButton />
        </span>
        <AppNav />
      </aside>
      <main className="min-w-0 px-4 pt-8 pb-24 sm:px-8 lg:px-12 lg:pt-12">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
