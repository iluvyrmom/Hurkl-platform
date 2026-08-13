import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditLogEntry } from "../audit/log";
import {
  MockAIModelProvider,
  type AIModelProvider,
  type ConversationTurn,
} from "../mason/providers/ai-model-provider";
import { routeModelTier } from "../mason/model-routing";
import { buildMasonSystemPrompt } from "../mason/system-prompt";
import { classifyMessageTaskType } from "../mason/task-classification";
import { resolveDiscountAuthority } from "../mason/discount-authority";
import { CRITICAL_REVIEW_FALLBACK_REPLY, reviewMasonReply } from "../mason/critical-review";
import {
  customerExplicitlyRequestedOwnerContact,
  recordOwnerEscalation,
  requiresOwnerApproval,
} from "../mason/escalation";
import {
  evaluateBudget,
  getBudgetStatus,
  wouldExceedBudgetForAdvancedReasoning,
  type SpendReader,
} from "../mason/spend-guard";
import type { Channel, CommunicationAdapter, InboundMessage } from "./adapter";
import { HURKL_INTERNAL_COMPANY_ID, HURKL_INTERNAL_COMPANY_NAME } from "./internal-company";
import { resolveTelegramSender, UnrecognizedSenderError } from "./telegram-identity";

export interface ReceiveMessageDeps {
  /** Service-role client — required for the telegram_links lookup, and to write conversations/messages/audit_log rows on the internal company's behalf (a hurkl_admin's own RLS bypass covers reads/writes, but the service-role client keeps this pipeline's data access uniform regardless of channel/sender role). */
  admin: SupabaseClient;
  adapter: CommunicationAdapter;
  /** Defaults to MockAIModelProvider — see lib/mason/providers/get-ai-model-provider.ts for how a real provider gets activated (ANTHROPIC_API_KEY). */
  aiModel?: AIModelProvider;
}

export interface ReceiveMessageResult {
  /** false when the sender was unrecognized, or the message was a duplicate delivery of one already processed — either way, dropped with no reply and no new audit entry. */
  handled: boolean;
}

interface ConversationRow {
  id: string;
}

// Cost/history bound: how many prior messages are sent to the model as
// context. Independent of AnthropicModelProvider's own per-message
// character truncation — this bounds how many *messages* are included
// at all.
const MAX_HISTORY_MESSAGES = 10;

const POSTGRES_UNIQUE_VIOLATION = "23505";

async function findOrCreateConversation(
  admin: SupabaseClient,
  input: { companyId: string; channel: Channel; externalConversationId: string },
): Promise<ConversationRow> {
  const { data: existing, error: selectError } = await admin
    .from("conversations")
    .select("id")
    .eq("channel", input.channel)
    .eq("external_conversation_id", input.externalConversationId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to look up conversation: ${selectError.message}`);
  }
  if (existing) {
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing;
  }

  // Low-concurrency, single-owner internal channel today, so a plain
  // insert (rather than migration 3's atomic insert-or-claim pattern)
  // is an acceptable simplification: a genuine race would surface as a
  // unique-constraint error on (channel, external_conversation_id),
  // not a silent duplicate. Revisit if this channel ever serves
  // multiple concurrent senders in the same external conversation.
  const { data: created, error: insertError } = await admin
    .from("conversations")
    .insert({
      company_id: input.companyId,
      channel: input.channel,
      external_conversation_id: input.externalConversationId,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(`Failed to create conversation: ${insertError?.message}`);
  }
  return created;
}

/** Prior turns for this conversation, oldest first, bounded by MAX_HISTORY_MESSAGES. Best-effort — a lookup failure degrades to no history rather than blocking the reply. */
async function fetchRecentHistory(
  admin: SupabaseClient,
  conversationId: string,
): Promise<ConversationTurn[]> {
  const { data, error } = await admin
    .from("messages")
    .select("direction, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (error || !data) return [];

  return data
    .slice()
    .reverse()
    .map((row) => ({
      role: row.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      text: row.body as string,
    }));
}

interface CompanyContextRow {
  name: string;
  phone: string | null;
  email: string | null;
  discretionary_discount_max_percent: number | null;
}

/**
 * Real, per-company data Mason's prompt and the critical-review guard
 * both need: verified owner contact info and the owner-configured
 * discretionary discount ceiling (see
 * supabase/migrations/00000000000009_mason_discount_authority_and_escalations.sql).
 * Best-effort — a lookup failure degrades to "no verified contact info,
 * no discount authority" (the safe defaults), matching
 * fetchRecentHistory's resilience pattern, rather than blocking the
 * reply.
 */
async function fetchCompanyContext(
  admin: SupabaseClient,
  companyId: string,
): Promise<CompanyContextRow | null> {
  const { data, error } = await admin
    .from("companies")
    .select("name, phone, email, discretionary_discount_max_percent")
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CompanyContextRow;
}

interface InsertMessageInput {
  conversationId: string;
  companyId: string;
  direction: "inbound" | "outbound";
  senderProfileId: string | null;
  body: string;
  externalMessageId?: string;
  modelTier?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
}

class DuplicateMessageError extends Error {}

async function insertMessage(admin: SupabaseClient, input: InsertMessageInput): Promise<void> {
  const { error } = await admin.from("messages").insert({
    conversation_id: input.conversationId,
    company_id: input.companyId,
    direction: input.direction,
    sender_profile_id: input.senderProfileId,
    body: input.body,
    external_message_id: input.externalMessageId ?? null,
    model_tier: input.modelTier ?? null,
    model_id: input.modelId ?? null,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    estimated_cost_usd: input.estimatedCostUsd ?? null,
    latency_ms: input.latencyMs ?? null,
  });

  if (error) {
    if ((error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      throw new DuplicateMessageError();
    }
    throw new Error(`Failed to insert message: ${error.message}`);
  }
}

const FALLBACK_REPLY_TEXT =
  "Mason is having trouble responding right now — please try again in a moment.";

// Rough chars-per-token heuristic for projecting the cost of an
// advanced_reasoning call *before* making it (see
// wouldExceedBudgetForAdvancedReasoning) — not token-accurate, just
// conservative enough to avoid an obvious single-call budget overshoot.
const APPROX_CHARS_PER_TOKEN = 4;

function estimateProjectedInputTokens(
  systemPrompt: string,
  userMessage: string,
  history: ConversationTurn[],
): number {
  const historyChars = history.reduce((sum, turn) => sum + turn.text.length, 0);
  const totalChars = systemPrompt.length + userMessage.length + historyChars;
  return Math.ceil(totalChars / APPROX_CHARS_PER_TOKEN);
}

/**
 * The one shared pipeline every channel's inbound entry point calls
 * (see app/api/telegram/webhook/route.ts and
 * scripts/telegram-dev-bridge.ts — both thin transports over this).
 *
 * 1. authenticate the sender (telegram_links → profile)
 * 2. find-or-create the conversation, company-scoped
 * 3. fetch recent history for context (best-effort)
 * 4. persist the inbound message — duplicate deliveries of an already-
 *    processed message are dropped here (see DuplicateMessageError)
 * 5. audit log the receipt
 * 6. check the hard spend guard (lib/mason/spend-guard.ts) — if any
 *    HURKL-wide or per-company daily/monthly ceiling is already met,
 *    no Anthropic request is made at all (a "message_budget_blocked"
 *    audit entry is recorded instead); otherwise call Mason (real
 *    routing + AIModelProvider — mock unless ANTHROPIC_API_KEY is set;
 *    see get-ai-model-provider.ts), downgrading a single
 *    advanced_reasoning call to low_cost if its projected cost would
 *    newly tip a ceiling. A reasoning failure falls back to a safe
 *    reply rather than corrupting the conversation or leaving the
 *    sender with silence.
 * 7. persist Mason's outbound message (with usage/cost accounting)
 * 8. CommunicationAdapter.send() → back through the channel
 * 9. audit log the response
 *
 * No step here calls back into receiveMessage or any other agent loop
 * — there is no recursion and nothing to runaway-loop-protect beyond
 * AnthropicModelProvider's own bounded (max 1) retry.
 */
export async function receiveMessage(
  deps: ReceiveMessageDeps,
  inbound: InboundMessage,
): Promise<ReceiveMessageResult> {
  const { admin, adapter, aiModel = new MockAIModelProvider() } = deps;

  let sender;
  try {
    sender = await resolveTelegramSender(admin, inbound.externalUserId);
  } catch (error) {
    if (error instanceof UnrecognizedSenderError) {
      return { handled: false };
    }
    throw error;
  }

  // hurkl_admin profiles have a null company_id by design (they're not
  // scoped to one tenant) — internal conversations attach to the fixed
  // internal pseudo-company instead. A future tenant-linked sender
  // (real company_id) would use their own company here unchanged.
  const companyId = sender.companyId ?? HURKL_INTERNAL_COMPANY_ID;
  const isInternalHurklChannel = companyId === HURKL_INTERNAL_COMPANY_ID;

  const conversation = await findOrCreateConversation(admin, {
    companyId,
    channel: inbound.channel,
    externalConversationId: inbound.externalConversationId,
  });

  const history = await fetchRecentHistory(admin, conversation.id);

  try {
    await insertMessage(admin, {
      conversationId: conversation.id,
      companyId,
      direction: "inbound",
      senderProfileId: sender.profileId,
      body: inbound.text,
      externalMessageId: inbound.externalMessageId,
    });
  } catch (error) {
    if (error instanceof DuplicateMessageError) {
      // Same channel message delivered more than once (e.g. Telegram
      // redelivery) — already recorded and replied to on the first
      // delivery. Drop silently: no second AI call, no second reply.
      return { handled: false };
    }
    throw error;
  }

  await recordAuditLogEntry(admin, {
    companyId,
    actorUserId: sender.profileId,
    action: "message_received",
    autonomyTier: "tier_1_automatic",
    policyReference: "communications.receive",
    subjectType: "conversation",
    subjectId: conversation.id,
    metadata: { channel: inbound.channel },
  });

  // A genuine owner-approval scenario (damage, refund, legal, etc.) is
  // recorded as a real owner-action item independent of how Mason ends
  // up wording its reply — Mason still replies and keeps helping (see
  // system-prompt.ts's escalation framing); this just guarantees a
  // durable record exists for the owner too, per the founder's "bring
  // the issue to the owner rather than sending the customer away"
  // instruction.
  if (requiresOwnerApproval(inbound.text)) {
    await recordOwnerEscalation(admin, {
      companyId,
      conversationId: conversation.id,
      reason: "owner_review_requested",
      customerSummary: inbound.text,
    });
  }

  const companyContext = isInternalHurklChannel
    ? null
    : await fetchCompanyContext(admin, companyId);
  const discountAuthority = resolveDiscountAuthority(
    companyContext?.discretionary_discount_max_percent,
  );
  const customerRequestedOwnerContact = customerExplicitlyRequestedOwnerContact(inbound.text);

  const tier = routeModelTier(classifyMessageTaskType(inbound.text));
  const systemPrompt = buildMasonSystemPrompt({
    companyName: companyContext?.name ?? HURKL_INTERNAL_COMPANY_NAME,
    isInternalHurklChannel,
    senderName: sender.fullName,
    senderRole: sender.role,
    ownerPhone: companyContext?.phone ?? null,
    ownerEmail: companyContext?.email ?? null,
    discountAuthority,
    customerRequestedOwnerContact,
  });

  // Hard server-side spend guard — checked before every real Anthropic
  // request, any tier, for every sender including hurkl_admin/owner
  // (no identity is exempt; see lib/mason/spend-guard.ts). Gate A below
  // blocks the call entirely once an accumulated ceiling is already
  // met; Gate B (further down) only downgrades a single
  // advanced_reasoning call to low_cost when it would newly tip a
  // ceiling — it never blocks outright.
  // Cast through `unknown`: assigning the real SupabaseClient directly
  // against SpendReader's chainable interface makes the TS checker
  // expand PostgrestFilterBuilder's generics against our own
  // self-referential type and blow the instantiation-depth limit
  // (TS2589) — the real client satisfies SpendReader's shape at
  // runtime (same .from().select().eq()/.gte() surface used
  // elsewhere in this file), so the cast is safe.
  const budgetStatus = await getBudgetStatus(admin as unknown as SpendReader, companyId);
  const budgetDecision = evaluateBudget(budgetStatus);

  let aiResponse;
  if (!budgetDecision.allowed) {
    console.warn("Anthropic spend ceiling reached — using fallback reply, no request sent", {
      conversationId: conversation.id,
      tier,
      exceededCeiling: budgetDecision.exceededCeiling,
    });
    await recordAuditLogEntry(admin, {
      companyId,
      actorUserId: sender.profileId,
      action: "message_budget_blocked",
      autonomyTier: "tier_1_automatic",
      policyReference: "communications.respond",
      subjectType: "conversation",
      subjectId: conversation.id,
      metadata: { channel: inbound.channel, tier, exceededCeiling: budgetDecision.exceededCeiling },
    });
    aiResponse = {
      text: FALLBACK_REPLY_TEXT,
      tier,
      modelId: "budget_limit",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    };
  } else {
    let effectiveTier = tier;
    if (tier === "advanced_reasoning") {
      const projectedInputTokens = estimateProjectedInputTokens(
        systemPrompt,
        inbound.text,
        history,
      );
      if (wouldExceedBudgetForAdvancedReasoning(budgetDecision.status, projectedInputTokens)) {
        effectiveTier = "low_cost";
      }
    }

    try {
      aiResponse = await aiModel.complete({
        tier: effectiveTier,
        systemPrompt,
        userMessage: inbound.text,
        history,
      });

      // The one deterministic safety check every real model reply
      // passes through before a customer ever sees it — see
      // lib/mason/critical-review.ts. Catches exactly the reported
      // production failure (an invented flat-dollar discount) and any
      // reply that claims more discount than this company's owner has
      // actually authorized.
      const review = reviewMasonReply(aiResponse.text, discountAuthority);
      if (!review.ok) {
        console.warn("Mason reply blocked by critical review", {
          conversationId: conversation.id,
          violations: review.violations,
        });
        await recordOwnerEscalation(admin, {
          companyId,
          conversationId: conversation.id,
          reason: "unsupported_pricing_claim_blocked",
          customerSummary: `Mason's draft reply was blocked before sending (${review.violations.join(", ")}). Customer's message: ${inbound.text}`,
        });
        await recordAuditLogEntry(admin, {
          companyId,
          action: "reply_blocked_by_critical_review",
          autonomyTier: "tier_1_automatic",
          policyReference: "mason.critical-review",
          subjectType: "conversation",
          subjectId: conversation.id,
          metadata: { violations: review.violations },
        });
        aiResponse = { ...aiResponse, text: CRITICAL_REVIEW_FALLBACK_REPLY };
      }
    } catch (error) {
      // A reasoning failure must not corrupt the conversation or leave
      // the sender with silence — fall back to a safe, clearly-labeled
      // reply instead of propagating the error (which would 500 the
      // webhook and risk a Telegram-redelivery loop). Distinct from
      // the budget-block path above: this is a real provider failure,
      // not a refusal to spend, and must not be counted as one.
      console.error("Mason reasoning failed", {
        conversationId: conversation.id,
        tier: effectiveTier,
        error: error instanceof Error ? error.message : String(error),
      });
      aiResponse = {
        text: FALLBACK_REPLY_TEXT,
        tier: effectiveTier,
        modelId: "fallback",
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: 0,
      };
    }
  }

  await insertMessage(admin, {
    conversationId: conversation.id,
    companyId,
    direction: "outbound",
    senderProfileId: null,
    body: aiResponse.text,
    modelTier: aiResponse.tier,
    modelId: aiResponse.modelId,
    inputTokens: aiResponse.inputTokens,
    outputTokens: aiResponse.outputTokens,
    estimatedCostUsd: aiResponse.estimatedCostUsd,
    latencyMs: aiResponse.latencyMs,
  });

  try {
    const sendResult = await adapter.send({
      channel: inbound.channel,
      externalConversationId: inbound.externalConversationId,
      text: aiResponse.text,
    });

    await recordAuditLogEntry(admin, {
      companyId,
      action: "message_sent",
      autonomyTier: "tier_1_automatic",
      policyReference: "communications.respond",
      subjectType: "conversation",
      subjectId: conversation.id,
      metadata: {
        channel: inbound.channel,
        externalMessageId: sendResult.externalMessageId,
        modelTier: aiResponse.tier,
        modelId: aiResponse.modelId,
        inputTokens: aiResponse.inputTokens,
        outputTokens: aiResponse.outputTokens,
        estimatedCostUsd: aiResponse.estimatedCostUsd,
      },
    });
  } catch (error) {
    // The reply text is already persisted above — the conversation
    // record is intact even though delivery failed. Log and stop
    // rather than throwing (which would 500 the webhook).
    console.error("Failed to deliver Mason's reply", {
      conversationId: conversation.id,
      channel: inbound.channel,
      error: error instanceof Error ? error.message : String(error),
    });
    await recordAuditLogEntry(admin, {
      companyId,
      action: "message_send_failed",
      autonomyTier: "tier_1_automatic",
      policyReference: "communications.respond",
      subjectType: "conversation",
      subjectId: conversation.id,
      metadata: { channel: inbound.channel },
    });
  }

  return { handled: true };
}
