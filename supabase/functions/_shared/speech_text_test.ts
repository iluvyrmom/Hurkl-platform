import { deepStrictEqual as assertEquals, ok } from "node:assert";
import { MAX_SPOKEN_CHARS, spokenVersion, toSpeechText } from "./speech_text.ts";

Deno.test("rates and money are said the way people say them", () => {
  assertEquals(toSpeechText("It is $50/hour."), "It is 50 dollars an hour.");
  assertEquals(toSpeechText("Two movers are $100/hr."), "Two movers are 100 dollars an hour.");
  assertEquals(toSpeechText("Travis pays $500 a month."), "Travis pays 500 dollars a month.");
  assertEquals(toSpeechText("Today so far: $0.25"), "Today so far: 0 dollars and 25 cents");
});

Deno.test("state codes after a city are said in full", () => {
  assertEquals(toSpeechText("We serve Vancouver, WA and Portland, OR."), "We serve Vancouver, Washington and Portland, Oregon.");
  assertEquals(toSpeechText("Moving to Tigard OR."), "Moving to Tigard, Oregon.");
  assertEquals(toSpeechText("123 Main St, Beaverton, OR 97005"), "123 Main St, Beaverton, Oregon 97005");
});

Deno.test("ordinary words stay as they are", () => {
  assertEquals(toSpeechText("Today or tomorrow works."), "Today or tomorrow works.");
  assertEquals(toSpeechText("Yes, OK, that works."), "Yes, OK, that works.");
});

Deno.test("markdown symbols are never read aloud", () => {
  assertEquals(toSpeechText("**Done.** Travis is #1."), "Done. Travis is 1.");
});

Deno.test("long replies are summed up aloud and point to the screen", () => {
  const long = "First point is short. Second point is short too. " + "More detail here. ".repeat(100);
  const said = spokenVersion(long);
  ok(said.length < MAX_SPOKEN_CHARS);
  ok(said.startsWith("First point is short. Second point is short too."));
  ok(said.endsWith("The rest is on your screen."));
  assertEquals(spokenVersion("Short and sweet."), "Short and sweet.");
});
