"use client";

import { useState } from "react";

interface MasonChatProps {
  companySlug: string;
  companyPhone: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const OPENING_MESSAGE: ChatMessage = {
  role: "assistant",
  text: "Hi, I'm Mason — happy to help. What can I do for you?",
};

export function MasonChat({ companySlug, companyPhone }: MasonChatProps) {
  const [conversationId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([OPENING_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadSubmitted, setLeadSubmitted] = useState(false);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);

    try {
      const response = await fetch(`/api/mason/chat/${companySlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Something went wrong." }));
        setError(body.error ?? "Something went wrong.");
        setSending(false);
        return;
      }

      const body = (await response.json()) as { reply: string; leadSubmitted: boolean };
      setMessages((prev) => [...prev, { role: "assistant", text: body.reply }]);
      if (body.leadSubmitted) setLeadSubmitted(true);
    } catch {
      setError("Mason is having trouble responding right now — please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mason-chat">
      <div className="mason-chat-log" role="log" aria-live="polite">
        {messages.map((message, index) => (
          <div key={index} className={`mason-chat-bubble mason-chat-bubble-${message.role}`}>
            {message.text}
          </div>
        ))}
        {sending && (
          <div className="mason-chat-bubble mason-chat-bubble-assistant mason-chat-typing">
            Mason is typing…
          </div>
        )}
      </div>

      {leadSubmitted && (
        <div className="mason-chat-confirmation" role="status">
          Got it — we&apos;ll follow up shortly to confirm the details.
        </div>
      )}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}

      <form onSubmit={handleSend} className="mason-chat-form">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a message…"
          aria-label="Message Mason"
          disabled={sending}
          className="mason-chat-input"
        />
        <button type="submit" className="btn-accent tap-target" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>

      {companyPhone && (
        <p className="hero-phone mason-chat-phone-fallback">
          Prefer to talk it through? Call{" "}
          <a className="tap-target" href={`tel:${companyPhone.replace(/[^0-9+]/g, "")}`}>
            {companyPhone}
          </a>
          .
        </p>
      )}
    </div>
  );
}
