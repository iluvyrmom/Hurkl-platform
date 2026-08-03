import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { CreateCompanyForm } from "./create-company-form";

export default async function OnboardingPage() {
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

  if (profile?.company_id) {
    redirect("/dashboard");
  }

  return (
    <main>
      <h1>Set up your company</h1>
      <p>Tell us about your business to finish creating your HURKL account.</p>
      <CreateCompanyForm />
    </main>
  );
}
