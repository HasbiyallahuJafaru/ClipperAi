import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <section className="flex justify-center pt-12">
      <SignIn />
    </section>
  );
}
