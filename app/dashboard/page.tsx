import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { CustomersPanel } from "./customers-panel";
import { SignOutButton } from "./sign-out-button";

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
    <main>
      <h1>HURKL</h1>
      <SignOutButton />
      <CustomersPanel />
    </main>
  );
}
