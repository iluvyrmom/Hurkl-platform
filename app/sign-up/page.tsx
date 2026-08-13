import Image from "next/image";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <main className="hurkl-auth-page">
      <div className="hurkl-auth-card">
        <Image src="/hurkl/icon.png" alt="" width={64} height={64} className="hurkl-icon" />
        <Image src="/hurkl/wordmark.png" alt="HURKL" width={220} height={72} className="hurkl-wordmark" />
        <h1 className="sr-only">Create your HURKL account</h1>
        <SignUpForm />
        <p className="hurkl-auth-footer">
          Already have an account? <a href="/sign-in">Sign in</a>
        </p>
      </div>
    </main>
  );
}
