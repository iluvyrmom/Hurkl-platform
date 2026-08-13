"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "check-email">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("submitting");

    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      setStatus("idle");
      return;
    }

    // If email confirmation is required, there's no session yet.
    if (!data.session) {
      setStatus("check-email");
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  if (status === "check-email") {
    return <p>Check your email to confirm your account, then sign in.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="hurkl-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="hurkl-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="hurkl-form-error">
          {error}
        </p>
      )}
      <button type="submit" className="hurkl-btn" disabled={status === "submitting"}>
        {status === "submitting" ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
