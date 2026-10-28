"use server";

import { revalidatePath } from "next/cache";
import {
  decide,
  resubmit,
  startAndCheck,
  type DraftRow,
  type SaveResult,
} from "../../../lib/agents/drafts";
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

const SELECT_COLUMNS = "id,company_id,channel,stage,body,round,open_fixes,history";

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

async function loadAndSave(
  formData: FormData,
  build: (row: DraftRow, userId: string) => SaveResult,
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

  const result = build(row as DraftRow, access.userId);
  if (!result.ok) return { ok: false, message: result.error };

  const { error } = await supabase
    .from("agent_drafts")
    .update({ ...result.save, ...extra(access.userId), updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("company_id", access.companyId)
    // Only act on the stage we just read, so a double tap can't decide twice.
    .eq("stage", row.stage);
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
      (row) => resubmit(row, text(formData, "body")),
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
      (row) => decide(row, text(formData, "decision"), text(formData, "reason")),
      (stage) =>
        stage === "approved" ? "Approved. Nothing is posted automatically." : "Turned down.",
      (userId) => ({ decided_by: userId, decided_at: new Date().toISOString() }),
    );
  } catch (error) {
    console.error("agents: decide crashed", error instanceof Error ? error.message : "unknown");
    return FAILED;
  }
}
