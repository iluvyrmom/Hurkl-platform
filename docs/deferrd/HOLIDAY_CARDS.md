# DEFERRD holiday cards — decisions record

Recorded from the founder's design session of 2026-11-01. DEFERRD is a separate company and product from HURKL; this file only records decisions so they do not live only in chat. Nothing here changes HURKL or Mason behavior.

## What it is

An animated digital holiday card (Christmas, Thanksgiving) that a company pays DEFERRD to send to its own mailing list. The company can choose **card only** or **card plus a digital gift card**.

## Decisions (founder-approved)

- **Recipient name is optional; the company name is always on the card.** With no name the card reads "Merry Christmas, from [company]". Works per person, so a list with some names missing still renders cleanly.
- **Digital gift cards are digital only** (existing DEFERRD rule). In the Christmas card, Santa drops a parachute gift box that opens and a gift card rises out, showing the amount and "from [company]", with a claim button.
- **The card may only show a gift card that has actually been purchased and delivered.** The animation is never proof of delivery. In the samples the amount and the claim button are placeholders; the real amount and claim link must come from the real gift card.
- **Santa has nine reindeer** (Rudolph leading, four pairs).
- **Sound uses only recorded audio** — no synthesized or generated sound effects. Santa's voice is the founder's own recording ("Ho, ho, ho, Merry Christmas"). The sleigh bells are a recording the founder supplied. The words wait until Santa finishes speaking. There is a Sound on/off button and tap to skip; reduced-motion shows the finished card.
- **Emails cannot play animation or sound.** An email is a short note with an "Open your card" button that opens the card page.

## Status

- Christmas and Thanksgiving cards exist as **samples only** (private Claude artifacts in the founder's account). They are **not in DEFERRD yet**.
- Putting them into DEFERRD uses Base44 credits; show the founder the exact changes first.

## Direction: DEFERRD leaves Base44 eventually

- Founder decision (Nov 1, 2026): DEFERRD should eventually move out of Base44.
- Until then, keep the card pages and card files self-contained and portable (plain HTML/JS plus audio files), so they can move without a rewrite.
- Do not buy a Base44 plan upgrade just to unlock backend functions, unless the founder decides to. The secure card lookup (`/card/:token`) is locked on the current plan, so real recipient links cannot work yet; sample-data preview (`/card/preview`) does.
- Moving off Base44 needs its own plan first (data export, payments, auth, and email), not a rushed copy.

## Open items

- **Confirm the license** of the sleigh-bell file ("dragon-studio-christmas-sleigh-bells-jingling") allows commercial use before DEFERRD sells cards with it. Confirm the plan/terms for any other audio.
- Wire the real gift card amount and claim link; only show the gift drop for a confirmed purchase.
- Check how DEFERRD stores recipient names (today a name is required per contact) so "name optional" works end to end.
- Test long company names against the card layout.
- Pricing is not yet confirmed by the founder.
- Any automated sending needs the CAN-SPAM / provider check first (see `CLAUDE.md`).
- Thanksgiving card has music, wind, geese and rustling leaves but no spoken greeting; the founder may add a short recording.
