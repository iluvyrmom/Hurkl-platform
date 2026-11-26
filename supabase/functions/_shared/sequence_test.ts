import { deepStrictEqual as eq } from "node:assert";
import { callGreeting, classifyConversation, decideNext, minutesUntilNextCheck, smsBody } from "./sequence.ts";

const T0 = Date.parse("2026-11-12T18:00:00Z");
const min = (m: number) => T0 + m * 60_000;

// ---- the full sequence Josh asked for ----

Deno.test("never answers: call, +5 call, text, +30 call, owner alert", () => {
  const s0 = decideNext(0, null, false);
  eq(s0, { type: "call", attempt: 1 });
  eq(minutesUntilNextCheck(s0, null), 5);

  const s1 = decideNext(1, "no_answer", false);
  eq(s1, { type: "call", attempt: 2 });
  eq(minutesUntilNextCheck(s1, null), 2);

  const s2 = decideNext(2, "no_answer", false);
  eq(s2, { type: "sms" });
  eq(minutesUntilNextCheck(s2, 2), 28); // call #3 lands 30 min after call #2

  const s3 = decideNext(3, null, false);
  eq(s3, { type: "call", attempt: 3 });
  eq(minutesUntilNextCheck(s3, null), 3);

  eq(decideNext(4, "no_answer", false), { type: "finish", status: "exhausted" });
});

Deno.test("answers first call: stop", () => {
  eq(decideNext(1, "answered", false), { type: "finish", status: "answered" });
});

Deno.test("answers second call: no text is sent", () => {
  eq(decideNext(2, "answered", false), { type: "finish", status: "answered" });
});

Deno.test("customer calls or texts back at any point: stop", () => {
  for (const step of [1, 2, 3, 4]) eq(decideNext(step, "no_answer", true), { type: "finish", status: "responded" });
});

Deno.test("still on the phone with Mason: wait, don't call again", () => {
  eq(decideNext(1, "in_progress", false), { type: "wait", minutes: 1 });
  eq(decideNext(2, "in_progress", false), { type: "wait", minutes: 1 });
});

Deno.test("result not available yet: wait", () => {
  eq(decideNext(1, "unknown", false), { type: "wait", minutes: 1 });
});

// ---- answered vs. not answered ----

Deno.test("Mason's reached_live_person flag wins", () => {
  eq(classifyConversation({ status: "done", analysis: { data_collection_results: { reached_live_person: { value: true } } } }, T0, min(5)), "answered");
  eq(classifyConversation({ status: "done", analysis: { data_collection_results: { reached_live_person: { value: false } } },
    transcript: [{ role: "user", message: "hi" }, { role: "user", message: "leave a message" }], metadata: { call_duration_secs: 40 } }, T0, min(5)), "no_answer");
});

Deno.test("voicemail termination = not answered", () => {
  eq(classifyConversation({ status: "done", metadata: { termination_reason: "Voicemail detected", call_duration_secs: 30 } }, T0, min(5)), "no_answer");
});

Deno.test("heuristic: real back-and-forth = answered, silence = not", () => {
  eq(classifyConversation({ status: "done", metadata: { call_duration_secs: 95 },
    transcript: [{ role: "agent", message: "Hi" }, { role: "user", message: "yes" }, { role: "user", message: "my sink" }] }, T0, min(5)), "answered");
  eq(classifyConversation({ status: "done", metadata: { call_duration_secs: 8 }, transcript: [{ role: "agent", message: "Hi" }] }, T0, min(5)), "no_answer");
});

Deno.test("live call and failed call", () => {
  eq(classifyConversation({ status: "in-progress" }, T0, min(5)), "in_progress");
  eq(classifyConversation({ status: "failed" }, T0, min(1)), "no_answer");
});

Deno.test("ringing: unknown at first, no answer after 3 min", () => {
  eq(classifyConversation({ status: "initiated" }, T0, min(1)), "unknown");
  eq(classifyConversation({ status: "initiated" }, T0, min(4)), "no_answer");
});

Deno.test("ElevenLabs unreachable: unknown, then give up after 6 min", () => {
  eq(classifyConversation(null, T0, min(2)), "unknown");
  eq(classifyConversation(null, T0, min(7)), "no_answer");
});

// ---- wording ----

Deno.test("greetings and text wording", () => {
  eq(callGreeting(1, "Lisa", "Executive Drains", "Unclog a Drain"),
    "Hi Lisa, this is Mason with Executive Drains. I'm calling about the Unclog a Drain request you just sent us through Angi. Is now a good time?");
  eq(callGreeting(2, null, "Executive Drains", "Unclog a Drain").startsWith("Hi, this is Mason with Executive Drains again"), true);
  const sms = smsBody("Lisa", "Executive Drains", "Unclog a Drain");
  eq(sms.includes("Reply STOP to opt out."), true);
  eq(sms.length < 320, true); // two SMS segments max
});
