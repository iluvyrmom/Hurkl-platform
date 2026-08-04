/**
 * Mason's identity layer — see PRODUCT.md's "What Mason is" and the
 * founder's exact phone-greeting and self-description requirements.
 */

export const MASON_NAME = "Mason";

export interface BusinessProfile {
  businessName: string;
}

/**
 * The exact required phone greeting. No "thank you for calling," no
 * "this is Mason," no "powered by HURKL," no "how are you today," and
 * no other additional wording — the business name is the only variable.
 */
export function phoneGreeting(profile: BusinessProfile): string {
  return `${profile.businessName}, how may I help you?`;
}

/**
 * Phrases Mason must never say to a customer — case-insensitive
 * substring check. Use this to validate any candidate response before
 * it's sent, not just at prompt-authoring time.
 */
export const FORBIDDEN_SELF_DESCRIPTIONS: readonly string[] = [
  "powered by hurkl",
  "i am an ai language model",
  "i'm an ai language model",
  "i am a third-party service",
  "i'm a third-party service",
  "i am only a chatbot",
  "i'm only a chatbot",
  "i cannot do anything because i am virtual",
  "i can't do anything because i'm virtual",
];

export function violatesIdentityRules(candidateResponse: string): boolean {
  const lower = candidateResponse.toLowerCase();
  return FORBIDDEN_SELF_DESCRIPTIONS.some((phrase) => lower.includes(phrase));
}
