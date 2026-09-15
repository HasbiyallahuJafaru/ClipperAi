import Image from "next/image";
import sky from "./sky.jpg";

/** Clerk's sign-in and sign-up cards, centred on the sky. */
export function AuthBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative isolate -mt-[4.25rem] flex min-h-[calc(100dvh-4rem)] justify-center overflow-hidden px-4 pt-[7.5rem] pb-24">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image src={sky} alt="" fill loading="eager" fetchPriority="high" sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(244_246_250/.15),rgb(244_246_250/.5)_60%,#f4f6fa)]" />
      </div>
      <div className="h-fit rounded-[1.1rem] shadow-float">{children}</div>
    </section>
  );
}
