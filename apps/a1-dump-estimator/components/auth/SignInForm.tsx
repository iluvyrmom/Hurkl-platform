"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, inputClassName } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Email">
        <input
          type="email"
          required
          className={inputClassName}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          required
          className={inputClassName}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && <p className="text-sm font-medium text-brand-danger">{error}</p>}
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
