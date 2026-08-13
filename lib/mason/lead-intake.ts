import type { LeadSubmission } from "../leads/leads";

/**
 * The machine-readable signal buildMasonSystemPrompt's leadIntake
 * instructions ask Mason to append to a reply once he has enough to
 * submit a real lead — see lib/communications/inbound.ts, which is the
 * only caller. Kept separate from inbound.ts so the parsing/mapping
 * logic is independently unit-testable without the rest of the
 * pipeline's plumbing.
 */
const LEAD_READY_PREFIX = "LEAD_READY:";

const LEAD_FIELD_KEYS = [
  "name",
  "phone",
  "email",
  "pickupAddress",
  "destinationAddress",
  "moveDate",
  "preferredTime",
  "propertyType",
  "accessNotes",
  "inventoryNotes",
  "specialItems",
  "packingNeeds",
  "notes",
] as const satisfies readonly (keyof LeadSubmission)[];

export interface ParsedLeadReady {
  /** Mason's reply with the LEAD_READY line removed — what the customer actually sees. */
  visibleText: string;
  fields: Partial<LeadSubmission>;
}

function pickLeadFields(raw: Record<string, unknown>): Partial<LeadSubmission> {
  const result: Partial<LeadSubmission> = {};
  for (const key of LEAD_FIELD_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      (result as Record<string, string>)[key] = value.trim();
    }
  }
  return result;
}

/**
 * Looks for a line starting with "LEAD_READY:" anywhere in Mason's
 * reply, strips it from the visible text regardless of whether the
 * JSON after it parses, and — only when it does parse to an object —
 * returns the known lead fields found in it. Deliberately tolerant:
 * a malformed marker (a model hiccup) degrades to "no lead extracted
 * yet," never a broken customer-facing reply.
 */
export function parseLeadReadyMarker(text: string): ParsedLeadReady | null {
  const lines = text.split("\n");
  const markerIndex = lines.findIndex((line) => line.trim().startsWith(LEAD_READY_PREFIX));
  if (markerIndex === -1) return null;

  const visibleText = lines
    .filter((_, index) => index !== markerIndex)
    .join("\n")
    .trim();

  const jsonPart = lines[markerIndex].trim().slice(LEAD_READY_PREFIX.length).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonPart);
  } catch {
    return { visibleText, fields: {} };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { visibleText, fields: {} };
  }

  return { visibleText, fields: pickLeadFields(parsed as Record<string, unknown>) };
}
