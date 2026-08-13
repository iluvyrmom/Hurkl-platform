import Image from "next/image";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="hurkl-auth-page">
      <div className="hurkl-auth-card">
        <Image src="/hurkl/icon.png" alt="" width={64} height={64} className="hurkl-icon" />
        <Image src="/hurkl/wordmark.png" alt="HURKL" width={220} height={72} className="hurkl-wordmark" />
        <h1 className="sr-only">Sign in to HURKL</h1>
        <SignInForm />
        <p className="hurkl-auth-footer">
          Need an account? <a href="/sign-up">Create one</a>
        </p>
      </div>
    </main>
  );
}
