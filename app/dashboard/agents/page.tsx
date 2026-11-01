import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CHANNEL_LABELS,
  STAGE_LABELS,
  isMarketingChannel,
  type DraftRow,
} from "../../../lib/agents/drafts";
import { resolveCompanyAccess } from "../../../lib/dashboard/company";
import { MARKETING_CHANNELS } from "../../../lib/mason/specialists/marketing";
import type { DraftStage } from "../../../lib/mason/marketing-pipeline";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { DecideButtons, NewDraftForm, NewSupportForm, ResubmitForm } from "./agent-forms";

// Per-request auth state and live data — never statically prerendered.
export const dynamic = "force-dynamic";

export const metadata = { title: "Agents" };

interface PageProps {
  searchParams: Promise<{ company?: string }>;
}

type Row = DraftRow & { created_at: string; specialist: string; context: string | null };

function channelLabel(row: Row): string {
  if (row.specialist === "support_specialist") return "Support reply";
  return isMarketingChannel(row.channel) ? CHANNEL_LABELS[row.channel] : row.channel;
}

function CustomerSaid({ row }: { row: Row }) {
  if (!row.context) return null;
  return (
    <p className="ov-muted" style={{ whiteSpace: "pre-wrap" }}>
      Customer wrote: {row.context}
    </p>
  );
}

export default async function AgentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const access = await resolveCompanyAccess(supabase, params.company);

  if (access.kind === "signed_out") redirect("/sign-in");
  if (access.kind === "no_company") {
    redirect(access.isAdmin ? "/dashboard/overview" : "/onboarding");
  }
  // Agent work is for the owner only.
  if (!access.isOwnerLevel) redirect("/dashboard/calendar");

  const { data, error } = await supabase
    .from("agent_drafts")
    .select(
      "id,company_id,specialist,channel,stage,body,context,round,open_fixes,history,created_at",
    )
    .eq("company_id", access.companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Row[];
  const by = (stage: DraftStage) => rows.filter((r) => r.stage === stage);
  const channels = MARKETING_CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] }));
  const slug = access.slug;

  return (
    <div className="ov-page">
      <main className="ov-main">
        <header className="ov-header">
          <Link className="ov-link" href="/dashboard">
            ← Dashboard
          </Link>
          <h1 className="ov-title">Agents</h1>
          <p className="ov-muted">
            Marketing checks your wording, then the Critic checks it again. Nothing is posted or
            sent anywhere. Approving only means you like the wording.
          </p>
        </header>

        {error && (
          <p role="alert" className="ov-warn">
            Couldn&apos;t load your drafts. Reload to try again.
          </p>
        )}

        <section className="ov-card" aria-labelledby="ag-new">
          <h2 id="ag-new">Check some wording</h2>
          <NewDraftForm companySlug={slug} channels={channels} />
        </section>

        <section className="ov-card" aria-labelledby="ag-support">
          <h2 id="ag-support">Answer a customer</h2>
          <p className="ov-muted">
            Anything about damage, injury, refunds, legal or a complaint is handed straight back to
            you. Nothing is sent.
          </p>
          <NewSupportForm companySlug={slug} />
        </section>

        <section className="ov-card ov-attention" aria-labelledby="ag-wait">
          <h2 id="ag-wait">{STAGE_LABELS.awaiting_owner}</h2>
          {by("awaiting_owner").length === 0 && (
            <p className="ov-good">Nothing is waiting for you.</p>
          )}
          {by("awaiting_owner").map((r) => (
            <article key={r.id}>
              <strong>{channelLabel(r)}</strong>
              <CustomerSaid row={r} />
              <p style={{ whiteSpace: "pre-wrap" }}>{r.body}</p>
              <DecideButtons id={r.id} companySlug={slug} />
            </article>
          ))}
        </section>

        {by("needs_changes").length > 0 && (
          <section className="ov-card" aria-labelledby="ag-fix">
            <h2 id="ag-fix">{STAGE_LABELS.needs_changes}</h2>
            {by("needs_changes").map((r) => (
              <article key={r.id}>
                <strong>{channelLabel(r)}</strong>
                <CustomerSaid row={r} />
                <ul className="ov-list">
                  {(Array.isArray(r.open_fixes) ? (r.open_fixes as string[]) : []).map((fix) => (
                    <li key={fix}>
                      <span className="ov-warn">{fix}</span>
                    </li>
                  ))}
                </ul>
                <ResubmitForm id={r.id} companySlug={slug} initial={r.body} />
              </article>
            ))}
          </section>
        )}

        {(["stalled", "approved", "rejected"] as const).map((stage) =>
          by(stage).length === 0 ? null : (
            <section className="ov-card" key={stage} aria-labelledby={`ag-${stage}`}>
              <h2 id={`ag-${stage}`}>{STAGE_LABELS[stage]}</h2>
              <ul className="ov-list">
                {by(stage).map((r) => (
                  <li key={r.id}>
                    <strong>{channelLabel(r)}</strong>
                    <CustomerSaid row={r} />
                    {Array.isArray(r.open_fixes) && stage === "stalled" && (
                      <span className="ov-warn">{(r.open_fixes as string[]).join(" ")}</span>
                    )}
                    <span className="ov-muted" style={{ whiteSpace: "pre-wrap" }}>
                      {r.body}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
      </main>
    </div>
  );
}
