# Mason's OpenAI verifier: build and activation handoff

Source status, 2026-11-27: the standalone OpenAI transport and deterministic
contract tests are built. This does **not** mean production Talk uses it yet.
Claude owns the private-Talk integration and independent source review on the
shared review task `79851040-90f3-4bbb-9797-57f419aff7bf`.

## When Josh returns

1. Create an API key in the OpenAI developer dashboard, with access to the
   selected verifier model and Responses endpoint. Check available API credits
   or billing there. ChatGPT app access is not evidence that this API project is
   ready to make requests.
2. In the existing HURKL Supabase project, open Edge Functions → Secrets and
   enter it as `OPENAI_API_KEY`. Never put the value in a chat, Mason's memory,
   a screenshot, a repository, or a browser/public environment variable.
3. Have the integration report readiness as booleans and missing configuration
   names only. Preserve the existing Anthropic and Mason voice settings.
4. After source review, run one bounded admin-only Talk test. Confirm both peer
   receipts, the exact text and speech wording, the recorded memory commit and
   combined usage. Enable the private pilot only after that evidence. Customer
   channels are a later reviewed release.

The key gives HURKL's backend access to an OpenAI model. It does not log in to
this ChatGPT conversation, automatically continue this chat or expose its full
history. The verifier receives the explicit question, exact answer versions
and scoped evidence supplied by the trio.

## Adapter contract for Claude

`supabase/functions/_shared/mason_verifier.ts` exports
`createOpenAIVerifier(options)`, returning `TrioPorts["verify"]`.
Create one instance for each request with:

- `apiKey`, `model`, `reviewerId`, and the original `question`.
- `budget.reserve(plan, signal)`: atomically reserve the worst-case call in the
  **same** aggregate ledger as Mason and Memory & Learning. If the coordinator
  already reserved this call, claim/reuse that reservation instead of charging
  twice. Return `{ id }`, or `null` to prevent the call.
- `budget.settle(usage)`: record actual provider/model, usage, status, response
  id and elapsed time before any verdict is released. Unknown/untrusted usage
  keeps at least the full reservation. Known cost above it must still be
  charged and flagged. A settlement error leaves the reserve charged and
  blocks release.

The plan includes request id, attempt, scope, digest, model, conservative input
token ceiling and maximum output tokens. The adapter does not invent model
prices or maintain another budget. The caller's canonical model/rate registry
must cover every permitted model; unknown rates fail closed.

Use the coordinator's exact actor/provider identities. Configure the model id
explicitly. If using an alias whose response reports a different snapshot id,
provide the allowed `acceptedResponseModels` explicitly; no prefix matching or
arbitrary model substitution is accepted.

Transport controls: fixed OpenAI Responses endpoint; no redirects, provider
tools, conversation history, background job or response storage; strict JSON
schema plus independent validation; exact request/digest/context checks;
separate written and speech verdicts; active scoped sources only; bounded
input/output bytes, tokens, time and calls. One HTTP call per verification
attempt; no automatic retries. The trio owns corrections. Refusals, malformed
JSON, incomplete output, wrong models, missing usage, cancelled requests and
failed accounting block release.

Errors contain generic codes, never provider response bodies or credentials.
Do not stream a draft or transform its speech after review. The speech action
must use the committed checked `speechText`; recomputing a summary requires a
new review.

## Model and API references checked for this build

Official documentation checked 2026-11-27:

- [API quickstart](https://developers.openai.com/api/docs/quickstart)
- [Structured outputs and refusal handling](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Responses request/response reference](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra):
  supported Responses/structured outputs; standard text input $1 and output
  $5 per million tokens before applicable pricing modifiers.
- [GPT-6.2 Sol](https://developers.openai.com/api/docs/models/gpt-6.2-sol):
  supported Responses/structured outputs; standard text input $2 and output
  $10 per million tokens before applicable pricing modifiers.

These are reference rates, not new spending authorization or billing guarantees.
The combined trio cap remains $2/day and $20/month. Recheck model availability,
account access and rates before activation. The official GPT-5 mini page now
marks it deprecated; do not select it just because an older example uses it.

## Checks without keys

```bash
npm exec --yes --package=deno@2.9.6 -- deno check --no-config supabase/functions/_shared/mason_verifier.ts
npm exec --yes --package=deno@2.9.6 -- deno test --no-config supabase/functions/_shared/mason_verifier_test.ts
```

The tests inject HTTP responses and accounting callbacks. They check release
ordering, refusal/failure handling, evidence/tenant boundaries, exact wording
receipts, budget denial, usage, timeout and call limits, and integration with
the existing coordinator. They do not prove real model factual accuracy,
provider account access, the database ledger or the live Talk/speech path.
