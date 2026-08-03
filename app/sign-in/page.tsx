import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main>
      <h1>Sign in to HURKL</h1>
      <SignInForm />
      <p>
        Need an account? <a href="/sign-up">Create one</a>
      </p>
    </main>
  );
}
