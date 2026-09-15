import { SignUp } from "@clerk/nextjs";
import { AuthBackdrop } from "../../auth-backdrop";

export default function SignUpPage() {
  return <AuthBackdrop><SignUp /></AuthBackdrop>;
}
