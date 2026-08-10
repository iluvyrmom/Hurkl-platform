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
 * 6. call Mason (real routing + AIModelProvider — mock unless
 *    ANTHROPIC_API_KEY is set; see get-ai-model-provider.ts). A
 *    reasoning failure falls back to a safe reply rather than
 *    corrupting the conversation or leaving the sender with silence.
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

  const tier = routeModelTier(classifyMessageTaskType(inbound.text));
  const systemPrompt = buildMasonSystemPrompt({
    companyName: HURKL_INTERNAL_COMPANY_NAME,
    isInternalHurklChannel,
    senderName: sender.fullName,
    senderRole: sender.role,
  });

  let aiResponse;
  try {
    aiResponse = await aiModel.complete({ tier, systemPrompt, userMessage: inbound.text, history });
  } catch (error) {
    // A reasoning failure must not corrupt the conversation or leave
    // the sender with silence — fall back to a safe, clearly-labeled
    // reply instead of propagating the error (which would 500 the
    // webhook and risk a Telegram-redelivery loop).
    console.error("Mason reasoning failed", {
      conversationId: conversation.id,
      tier,
      error: error instanceof Error ? error.message : String(error),
    });
    aiResponse = {
      text: FALLBACK_REPLY_TEXT,
      tier,
      modelId: "fallback",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    };
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
