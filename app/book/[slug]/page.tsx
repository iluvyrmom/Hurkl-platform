import { notFound } from "next/navigation";
import { getCompanyPublicProfile } from "../../../lib/leads/leads";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { LeadForm } from "./lead-form";

// Reads live company data on every request — never statically cached.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const profile = await getCompanyPublicProfile(supabase, slug);
  if (!profile) return {};
  return {
    title: profile.name,
    description: profile.slogan ?? `Request a free estimate from ${profile.name}.`,
  };
}

/**
 * Public, unauthenticated company page — the customer-facing front
 * door for a tenant's lead intake. Slug-driven and reads only what
 * lib/mason's get_company_public_profile() exposes (name/phone/email/
 * slogan), so this same route serves any future company, not just
 * A-1 — see docs/a1-best-moving-launch.md.
 */
export default async function CompanyBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const profile = await getCompanyPublicProfile(supabase, slug);

  if (!profile) {
    notFound();
  }

  const telHref = profile.phone ? `tel:${profile.phone.replace(/[^0-9+]/g, "")}` : null;

  return (
    <main className="company-page">
      <header className="company-hero">
        <h1>{profile.name}</h1>
        {profile.slogan && <p className="slogan">{profile.slogan}</p>}
        {telHref && profile.phone && (
          <p>
            <a className="btn-primary tap-target" href={telHref}>
              Call {profile.phone}
            </a>
          </p>
        )}
      </header>

      <section className="company-estimate">
        <h2>Request a free estimate</h2>
        <p>
          Tell us about your move and we&apos;ll follow up with a quote — or call us directly for
          the fastest response.
        </p>
        <LeadForm companySlug={slug} companyPhone={profile.phone} />
      </section>
    </main>
  );
}
