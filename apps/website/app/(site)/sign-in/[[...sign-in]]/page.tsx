import { SignIn } from "@clerk/nextjs";
import { AuthBackdrop } from "../../auth-backdrop";

export default function SignInPage() {
  return <AuthBackdrop><SignIn /></AuthBackdrop>;
}
