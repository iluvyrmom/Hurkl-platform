import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditLogEntry } from "../audit/log";
import { MASON_NAME } from "../mason/identity";
import { routeModelTier } from "../mason/model-routing";
import { MockAIModelProvider, type AIModelProvider } from "../mason/providers/ai-model-provider";
import type { Channel, CommunicationAdapter, InboundMessage } from "./adapter";
import { HURKL_INTERNAL_COMPANY_ID } from "./internal-company";
import { resolveTelegramSender, UnrecognizedSenderError } from "./telegram-identity";

export interface ReceiveMessageDeps {
  /** Service-role client — required for the telegram_links lookup, and to write conversations/messages/audit_log rows on the internal company's behalf (a hurkl_admin's own RLS bypass covers reads/writes, but the service-role client keeps this pipeline's data access uniform regardless of channel/sender role). */
  admin: SupabaseClient;
  adapter: CommunicationAdapter;
  /** Defaults to MockCommunicationAdapter's AI counterpart — a real Anthropic call needs its own explicit approval (ANTHROPIC_API_KEY + a conscious cost decision), not something this pipeline starts spending on by default. See docs/communications-architecture.md. */
  aiModel?: AIModelProvider;
}

export interface ReceiveMessageResult {
  /** false when the sender was unrecognized — the message was dropped with no reply and no audit entry (there is no company to attach one to), rather than confirming to a stranger that this bot exists. */
  handled: boolean;
}

interface ConversationRow {
  id: string;
}

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

async function insertMessage(
  admin: SupabaseClient,
  input: {
    conversationId: string;
    companyId: string;
    direction: "inbound" | "outbound";
    senderProfileId: string | null;
    body: string;
    externalMessageId?: string;
  },
): Promise<void> {
  const { error } = await admin.from("messages").insert({
    conversation_id: input.conversationId,
    company_id: input.companyId,
    direction: input.direction,
    sender_profile_id: input.senderProfileId,
    body: input.body,
    external_message_id: input.externalMessageId ?? null,
  });

  if (error) {
    throw new Error(`Failed to insert message: ${error.message}`);
  }
}

/**
 * The one shared pipeline every channel's inbound entry point calls
 * (see app/api/telegram/webhook/route.ts and
 * scripts/telegram-dev-bridge.ts — both thin transports over this).
 *
 * 1. authenticate the sender (telegram_links → profile)
 * 2. find-or-create the conversation, company-scoped
 * 3. persist the inbound message (history)
 * 4. audit log the receipt
 * 5. call Mason (model routing + AIModelProvider — mocked by default)
 * 6. persist Mason's outbound message (history)
 * 7. audit log the response
 * 8. CommunicationAdapter.send() → back through the channel
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
      // Temporary diagnostic logging while validating the first real
      // Telegram loop end-to-end — safe to remove once confirmed working.
      console.log("Telegram sender unrecognized", { externalUserId: inbound.externalUserId });
      return { handled: false };
    }
    throw error;
  }

  // hurkl_admin profiles have a null company_id by design (they're not
  // scoped to one tenant) — internal conversations attach to the fixed
  // internal pseudo-company instead. A future tenant-linked sender
  // (real company_id) would use their own company here unchanged.
  const companyId = sender.companyId ?? HURKL_INTERNAL_COMPANY_ID;

  const conversation = await findOrCreateConversation(admin, {
    companyId,
    channel: inbound.channel,
    externalConversationId: inbound.externalConversationId,
  });

  await insertMessage(admin, {
    conversationId: conversation.id,
    companyId,
    direction: "inbound",
    senderProfileId: sender.profileId,
    body: inbound.text,
  });

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

  const tier = routeModelTier("message_classification");
  const aiResponse = await aiModel.complete({
    tier,
    systemPrompt: `You are ${MASON_NAME}, HURKL's AI Office Manager, replying in an internal development conversation.`,
    userMessage: inbound.text,
  });

  await insertMessage(admin, {
    conversationId: conversation.id,
    companyId,
    direction: "outbound",
    senderProfileId: null,
    body: aiResponse.text,
  });

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
    metadata: { channel: inbound.channel, externalMessageId: sendResult.externalMessageId },
  });

  return { handled: true };
}
