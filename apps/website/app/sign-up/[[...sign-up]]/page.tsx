import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <section className="flex justify-center pt-12">
      <SignUp />
    </section>
  );
}
