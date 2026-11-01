"use server";

import { revalidatePath } from "next/cache";
import {
  decide,
  resubmit,
  startAndCheck,
  type DraftRow,
  type DraftSave,
} from "../../../lib/agents/drafts";
import {
  SUPPORT_CHANNEL,
  SUPPORT_SPECIALIST,
  decideSupport,
  resubmitSupport,
  startSupport,
  type SupportRow,
} from "../../../lib/agents/support-drafts";
import { resolveCompanyAccess } from "../../../lib/dashboard/company";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export interface AgentActionState {
  ok: boolean;
  message: string;
}

const SIGNED_OUT: AgentActionState = { ok: false, message: "Please sign in again." };
const NO_COMPANY: AgentActionState = { ok: false, message: "We couldn't find your company." };
const NOT_OWNER: AgentActionState = { ok: false, message: "Only the owner can use the agents." };
const FAILED: AgentActionState = {
  ok: false,
  message: "Something went wrong and nothing was changed. Please try again.",
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

const SELECT_COLUMNS =
  "id,company_id,specialist,channel,stage,body,context,round,open_fixes,history";

type AnyRow = DraftRow & SupportRow & { specialist: string };
type AnySave = { ok: true; save: DraftSave } | { ok: false; error: string };

/** Hand in new wording. Marketing's own checks and the Critic both run before the owner sees it. */
export async function submitNewDraftAction(
  _previous: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  try {
    const supabase = await createSupabaseServerClient();
    const access = await resolveCompanyAccess(supabase, text(formData, "company") || undefined);
    if (access.kind === "signed_out") return SIGNED_OUT;
    if (access.kind === "no_company") return NO_COMPANY;
    if (!access.isOwnerLevel) return NOT_OWNER;

    const id = crypto.randomUUID();
    const checked = startAndCheck({
      id,
      companyId: access.companyId,
      channel: text(formData, "channel"),
      text: text(formData, "body"),
    });
    if (!checked.ok) return { ok: false, message: checked.error };

    const { error } = await supabase.from("agent_drafts").insert({
      id,
      company_id: access.companyId,
      channel: text(formData, "channel"),
      created_by: access.userId,
      ...checked.save,
    });
    if (error) {
      console.error("agents: save failed", error.message);
      return FAILED;
    }
    revalidatePath("/dashboard/agents");
    return {
      ok: true,
      message:
        checked.save.stage === "awaiting_owner"
          ? "It passed every check. It's waiting for your decision below."
          : "It needs changes first. See the notes below and fix the wording.",
    };
  } catch (error) {
    console.error("agents: submit crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}

/** Paste what a customer wrote (and, if you like, your own reply). Sensitive messages come straight back to you. */
export async function submitSupportDraftAction(
  _previous: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  try {
    const supabase = await createSupabaseServerClient();
    const access = await resolveCompanyAccess(supabase, text(formData, "company") || undefined);
    if (access.kind === "signed_out") return SIGNED_OUT;
    if (access.kind === "no_company") return NO_COMPANY;
    if (!access.isOwnerLevel) return NOT_OWNER;

    const id = crypto.randomUUID();
    const checked = startSupport({
      id,
      companyId: access.companyId,
      customerMessage: text(formData, "customer_message"),
      reply: text(formData, "reply"),
    });
    if (!checked.ok) return { ok: false, message: checked.error };

    const { error } = await supabase.from("agent_drafts").insert({
      id,
      company_id: access.companyId,
      specialist: SUPPORT_SPECIALIST,
      channel: SUPPORT_CHANNEL,
      created_by: access.userId,
      ...checked.save,
    });
    if (error) {
      console.error("agents: support save failed", error.message);
      return FAILED;
    }
    revalidatePath("/dashboard/agents");
    const stage = checked.save.stage;
    return {
      ok: true,
      message:
        stage === "awaiting_owner"
          ? "It passed every check. It's waiting for your decision below."
          : stage === "stalled"
            ? "This one needs you, not a drafted reply. It's listed below."
            : "Saved. Write the reply below, or fix the notes.",
    };
  } catch (error) {
    console.error(
      "agents: support submit crashed",
      error instanceof Error ? error.message : "unknown",
    );
    return FAILED;
  }
}

async function loadAndSave(
  formData: FormData,
  build: (row: AnyRow, userId: string) => AnySave,
  successMessage: (stage: string) => string,
  extra: (userId: string) => Record<string, unknown> = () => ({}),
): Promise<AgentActionState> {
  const supabase = await createSupabaseServerClient();
  const access = await resolveCompanyAccess(supabase, text(formData, "company") || undefined);
  if (access.kind === "signed_out") return SIGNED_OUT;
  if (access.kind === "no_company") return NO_COMPANY;
  if (!access.isOwnerLevel) return NOT_OWNER;

  const { data: row, error: readError } = await supabase
    .from("agent_drafts")
    .select(SELECT_COLUMNS)
    .eq("id", text(formData, "id"))
    .eq("company_id", access.companyId)
    .maybeSingle();
  if (readError) {
    console.error("agents: load failed", readError.message);
    return FAILED;
  }
  if (!row) return { ok: false, message: "We couldn't find that draft." };

  const result = build(row as AnyRow, access.userId);
  if (!result.ok) return { ok: false, message: result.error };

  const { error } = await supabase
    .from("agent_drafts")
    .update({ ...result.save, ...extra(access.userId), updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("company_id", access.companyId)
    // Only act on the stage we just read, so a double tap can't decide twice.
    .eq("stage", (row as AnyRow).stage);
  if (error) {
    console.error("agents: update failed", error.message);
    return FAILED;
  }
  revalidatePath("/dashboard/agents");
  return { ok: true, message: successMessage(result.save.stage) };
}

export async function resubmitDraftAction(
  _previous: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  try {
    return await loadAndSave(
      formData,
      (row) =>
        row.specialist === SUPPORT_SPECIALIST
          ? resubmitSupport(row, text(formData, "body"))
          : resubmit(row, text(formData, "body")),
      (stage) =>
        stage === "awaiting_owner"
          ? "It passed every check. It's waiting for your decision."
          : stage === "stalled"
            ? "That's three tries. It's stopped, and Mason will take it from here."
            : "Still needs changes. See the notes.",
    );
  } catch (error) {
    console.error("agents: resubmit crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}

export async function decideDraftAction(
  _previous: AgentActionState,
  formData: FormData,
): Promise<AgentActionState> {
  try {
    return await loadAndSave(
      formData,
      (row) =>
        row.specialist === SUPPORT_SPECIALIST
          ? decideSupport(row, text(formData, "decision"), text(formData, "reason"))
          : decide(row, text(formData, "decision"), text(formData, "reason")),
      (stage) =>
        stage === "approved" ? "Approved. Nothing is posted automatically." : "Turned down.",
      (userId) => ({ decided_by: userId, decided_at: new Date().toISOString() }),
    );
  } catch (error) {
    console.error("agents: decide crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}
