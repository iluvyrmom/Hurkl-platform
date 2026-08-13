import Image from "next/image";
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
      <div className="company-masthead">
        {profile.logo_url ? (
          <Image
            src={profile.logo_url}
            alt={profile.name}
            className="company-logo"
            width={220}
            height={137}
          />
        ) : (
          <span className="company-name-badge">{profile.name}</span>
        )}
      </div>

      <section className="company-hero">
        {profile.hero_eyebrow && <span className="hero-eyebrow">{profile.hero_eyebrow}</span>}
        <h1>{profile.hero_headline ?? profile.name}</h1>
        {profile.slogan && <p className="slogan">{profile.slogan}</p>}

        <div className="mason-stage">
          <div className="mason-portrait">
            <Image src="/mason/avatar.jpg" alt="Mason" width={128} height={128} />
          </div>
          <span className="mason-badge">Fast, free estimates</span>
        </div>

        <div className="hero-ctas">
          <a href="#estimate" className="btn-accent tap-target">
            Talk to Mason
          </a>
          <p className="hero-cta-note">Get a fast, accurate quote.</p>
          <a href="#estimate" className="btn-outline tap-target">
            <span className="btn-outline-title">Schedule Your Move</span>
            <span className="btn-outline-sub">Pick a date that works for you.</span>
          </a>
        </div>

        {telHref && profile.phone && (
          <p className="hero-phone">
            <a className="tap-target" href={telHref}>
              Or call {profile.phone}
            </a>
          </p>
        )}

        <ul className="trust-badges">
          <li>Reliable Movers</li>
          <li>Honest Pricing</li>
          <li>On-Time Service</li>
          <li>Stress-Free Moves</li>
        </ul>
      </section>

      <section className="company-estimate" id="estimate">
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
