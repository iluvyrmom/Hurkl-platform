// HURKL — words for Mason's voice. The screen keeps normal writing ("$50/hr", "Vancouver, WA");
// the voice gets plain spoken words ("50 dollars an hour", "Vancouver, Washington").
// Same rules the A-1 website's voice uses (A-1 site: netlify/functions/speech-text.js); the two
// become one copy when Mason's website brain moves into HURKL (build step 4).

function currencyWords(rawAmount: string): string {
  const amount = Number(rawAmount.replace(/,/g, ""));
  if (!Number.isFinite(amount)) return `$${rawAmount}`;
  const dollars = Math.trunc(amount);
  const cents = Math.round((amount - dollars) * 100);
  const dollarLabel = dollars === 1 ? "dollar" : "dollars";
  if (cents === 0) return `${dollars.toLocaleString("en-US")} ${dollarLabel}`;
  return `${dollars.toLocaleString("en-US")} ${dollarLabel} and ${cents} ${cents === 1 ? "cent" : "cents"}`;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
};
// "OK" after a name is usually the word okay, so it is spoken as Oklahoma only before a ZIP code.
const NEEDS_ZIP = new Set(["OK"]);
const STATE_AFTER_PLACE = /\b([A-Z][A-Za-z'.-]*)(,?[ \t]+)([A-Z]{2})\b(?![A-Za-z])(\.?)(?=([ \t]*\d{5})?)/g;

export function spellOutStates(input: string): string {
  return input.replace(STATE_AFTER_PLACE, (match, place, _gap, code, dot, zip) => {
    const name = STATE_NAMES[code];
    if (!name) return match;
    if (NEEDS_ZIP.has(code) && !zip) return match;
    return `${place}, ${name}${dot}`;
  });
}

export function toSpeechText(input: string): string {
  return spellOutStates(input)
    .replace(/[*_#`>]+/g, "") // markdown symbols are never read aloud
    .replace(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*\/\s*(?:hour|hr)\b/gi, (_, a) => `${currencyWords(a)} an hour`)
    .replace(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s+(?:per|an)\s+hour\b/gi, (_, a) => `${currencyWords(a)} an hour`)
    .replace(/\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*\/\s*(?:hour|hr)\b/gi, (_, a) => `${currencyWords(a)} an hour`)
    .replace(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g, (_, a) => currencyWords(a))
    .replace(/\b([0-9]+)\s*hrs?\b/gi, "$1 hours")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Most characters Mason speaks in one go; longer replies are shown in full and summed up aloud. */
export const MAX_SPOKEN_CHARS = 1200;

/** What Mason actually says: the whole reply when short, otherwise its first sentences and a pointer. */
export function spokenVersion(reply: string): string {
  const speech = toSpeechText(reply);
  if (speech.length <= MAX_SPOKEN_CHARS) return speech;
  const sentences = speech.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [speech.slice(0, 400)];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > 500) break;
    out += s;
  }
  return `${(out || speech.slice(0, 400)).trim()} The rest is on your screen.`;
}
