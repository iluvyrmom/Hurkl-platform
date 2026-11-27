// HURKL — the HURKL plug: Mason's memory and AI roster as a remote MCP server.
//
// Any approved AI tool (Claude, ChatGPT, coding sessions, ...) connects here so they all share
// ONE memory: Mason's. Each tool gets its own key, created by the founder in the Mason app.
// Only the key's SHA-256 hash is stored; keys can be revoked any time.
//
// Transport: MCP Streamable HTTP, stateless, JSON responses (POST only).
// Auth:      Authorization: Bearer mason_<48 hex>   (checked by public.mason_connector_check)
// Limits:    per-key daily write limit (database), body size cap, result size caps.
// Safety:    the database refuses anything that looks like a password, key or card number;
//            rules/decisions (and any replacement of an existing entry) written through the plug
//            wait for the founder's approval; nothing is ever deleted.
// Makes no AI-model calls, so it adds no AI cost.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { callTool, INSTRUCTIONS, text, TOOLS, WRITE_TOOLS } from "../_shared/mason_tools.ts";

const SERVER = { name: "hurkl-mason", title: "Mason (HURKL)", version: "1.0.0" };
const PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_BODY = 64 * 1024;
function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

// ---------- HTTP / JSON-RPC ----------
Deno.serve(async (req: Request) => {
  if (req.method === "GET" || req.method === "DELETE") return json(405, { error: "method_not_allowed" }, { Allow: "POST" });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!/^mason_[a-f0-9]{48}$/.test(token)) {
    return json(401, { error: "unauthorized" }, { "WWW-Authenticate": 'Bearer realm="hurkl-mason"' });
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json(413, { error: "too_large" });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "too_large" });

  let msg: any;
  try { msg = JSON.parse(raw); } catch { return json(400, rpcError(null, -32700, "Parse error")); }
  if (Array.isArray(msg)) return json(400, rpcError(null, -32600, "Batches are not supported"));
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return json(400, rpcError(msg?.id ?? null, -32600, "Invalid request"));

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const isWrite = msg.method === "tools/call" && WRITE_TOOLS.has(String(msg.params?.name));
  const { data: check, error: checkErr } = await sb.rpc("mason_connector_check", { p_token: token, p_is_write: isWrite });
  if (checkErr) {
    console.error(JSON.stringify({ msg: "mason_mcp_check_failed", error: checkErr.message }));
    return json(500, rpcError(msg.id ?? null, -32603, "Temporary error"));
  }
  const conn = Array.isArray(check) ? check[0] : null;
  if (!conn) return json(401, { error: "unauthorized" }, { "WWW-Authenticate": 'Bearer realm="hurkl-mason"' });

  // Notifications (no id) get an empty 202.
  if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202 });

  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return json(200, rpcResult(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      }));
    }
    case "ping":
      return json(200, rpcResult(msg.id, {}));
    case "tools/list":
      return json(200, rpcResult(msg.id, { tools: TOOLS }));
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments && typeof msg.params.arguments === "object") ? msg.params.arguments : {};
      if (!TOOLS.some((t) => t.name === name)) return json(200, rpcError(msg.id, -32602, `Unknown tool: ${name}`));
      if (isWrite && !conn.allowed) return json(200, rpcResult(msg.id, text("Today's write limit for this AI is used up. Mason's memory is still readable; writing resumes tomorrow.", true)));
      try {
        const result = await callTool({ sb, connector: conn.connector_name }, name, args);
        console.log(JSON.stringify({ msg: "mason_mcp_tool", connector: conn.connector_name, tool: name }));
        return json(200, rpcResult(msg.id, result ?? text("Unknown tool.", true)));
      } catch (e) {
        console.error(JSON.stringify({ msg: "mason_mcp_tool_failed", connector: conn.connector_name, tool: name, error: String(e).slice(0, 200) }));
        return json(200, rpcResult(msg.id, text("Something went wrong on Mason's side. Try again in a moment.", true)));
      }
    }
    default:
      return json(200, rpcError(msg.id, -32601, `Method not found: ${msg.method}`));
  }
});
