"use client";

import { createBrowserClient } from "@supabase/ssr";
import { ProviderNotConfiguredError } from "@/lib/providers/errors";

/** Browser-side Supabase client — used only for Auth calls (sign in/out) from Client Components. */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new ProviderNotConfiguredError("Supabase", [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  }
  return createBrowserClient(url, anonKey);
}
