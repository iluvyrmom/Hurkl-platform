import { NextResponse } from "next/server";
import { MockCommunicationAdapter } from "../../../../../lib/communications/adapter";
import { receiveMessage } from "../../../../../lib/communications/inbound";
import { RateLimiter } from "../../../../../lib/http/rate-limit";
import { getAIModelProvider } from "../../../../../lib/mason/providers/get-ai-model-provider";
import { createSupabaseAdminClient } from "../../../../../lib/supabase/admin";

// Depends on live per-request state (client IP, the conversation, a
// real AI call) — never statically cached, same reasoning as
// app/api/leads/route.ts.
export const dynamic = "force-dynamic";

// 30 messages / 10 minutes / IP — generous for one real back-and-forth
// conversation, still a real ceiling. Independent of, and in addition
// to, lib/communications/inbound.ts's per-conversation turn cap and
// the hard Anthropic spend guard — see lib/http/rate-limit.ts's
// caveats (in-memory, single-process, best-effort).
const chatRateLimiter = new RateLimiter(30, 10 * 60 * 1000);

const MAX_MESSAGE_LENGTH = 2000;

function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-nf-client-connection-ip") ?? "unknown";
}

interface ChatRequestBody {
  /** Client-generated (crypto.randomUUID()), stable for one page visit — see app/book/[slug]/mason-chat.tsx. */
  conversationId?: string;
  message?: string;
}

/**
 * Mason's public web chat — the customer-facing replacement for the
 * structured lead form on app/book/[slug]/page.tsx, when a real
 * AIModelProvider is configured (ANTHROPIC_API_KEY; see
 * getAIModelProvider()). Thin HTTP wrapper only: all the actual
 * behavior (system prompt, spend guard, lead extraction) lives in the
 * one shared lib/communications/inbound.ts#receiveMessage pipeline
 * every channel uses — this route's only job is company resolution by
 * public slug, rate limiting, and translating the pipeline's result
 * into an HTTP response.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;

  const ip = clientIp(request);
  if (!chatRateLimiter.allow(ip)) {
    return NextResponse.json(
      { error: "Too many messages. Please try again in a few minutes." },
      { status: 429 },
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const message = body.message?.trim();
  const conversationId = body.conversationId?.trim();
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "message is too long" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id")
    .eq("website_slug", slug)
    .maybeSingle();

  if (companyError || !company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const adapter = new MockCommunicationAdapter("web_public");
    const aiModel = getAIModelProvider();

    const result = await receiveMessage(
      { admin, adapter, aiModel },
      {
        channel: "web_public",
        externalUserId: conversationId,
        externalConversationId: conversationId,
        text: message,
        receivedAt: new Date().toISOString(),
        companyId: (company as { id: string }).id,
        companySlug: slug,
      },
    );

    const reply = adapter.sentMessages.at(-1)?.text;
    if (!result.handled || reply == null) {
      return NextResponse.json(
        { error: "Mason is having trouble responding right now — please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ reply, leadSubmitted: Boolean(result.leadId) });
  } catch (error) {
    console.error("Mason public chat failed", {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Mason is having trouble responding right now — please try again." },
      { status: 500 },
    );
  }
}
