import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <main>
      <h1>Create your HURKL account</h1>
      <SignUpForm />
      <p>
        Already have an account? <a href="/sign-in">Sign in</a>
      </p>
    </main>
  );
}
