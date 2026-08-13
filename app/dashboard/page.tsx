import Image from "next/image";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { CustomersPanel } from "./customers-panel";
import { LeadsPanel } from "./leads-panel";
import { SignOutButton } from "./sign-out-button";

// This page depends on per-request auth state (cookies) and must never be
// statically prerendered. Without this, `createSupabaseServerClient()`'s
// env-check throw fires before `cookies()` signals dynamic rendering, so
// `next build` attempts (and fails) to statically prerender it.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) {
    redirect("/onboarding");
  }

  return (
    <div className="hurkl-page">
      <header className="hurkl-header">
        <div className="hurkl-header-brand">
          <Image src="/hurkl/icon.png" alt="" width={36} height={36} className="hurkl-icon" />
          <Image
            src="/hurkl/wordmark-compact.png"
            alt="HURKL"
            width={152}
            height={32}
            className="hurkl-wordmark"
          />
        </div>
        <SignOutButton />
      </header>
      <main className="dashboard-content">
        <LeadsPanel />
        <CustomersPanel />
      </main>
    </div>
  );
}
