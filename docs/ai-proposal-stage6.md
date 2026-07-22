# AI proposal engine (Stage 6)

The proposal engine continues from discovery through canonical preview and
explicit plan creation. The deterministic mock remains available for local
testing. The OpenAI provider is enabled explicitly on the backend with
`AI_PROVIDER=openai`; it never silently falls back to mock.

## Conversational planning turns

Every generation turn is validated as exactly one strict `ASK` or `PROPOSE`
action. `ASK` contains one concise question, optional suggested answers and a
bounded list of missing information. `PROPOSE` contains the existing strict,
human-readable proposal contract. Unknown fields and invalid turns are
rejected. Vague business requests ask for the business type first; supplied
duration, budget and availability controls are honored; the assistant proposes
after no more than three clarification questions or when the user elects to
continue with explicit assumptions.

The bounded conversation transcript is tab/session state under the
identity-scoped `ai-conversation` namespace. It is not written to PostgreSQL,
localStorage, URLs, logs or the canonical plan JSON. Leaving and reopening in
the same active tab resumes it; Start over clears it after confirmation.

## Data and lifecycle

Authenticated operations and immutable proposal revisions are stored in
PostgreSQL. The operation stores only bounded metadata (`inputLength`, selected
and detected language, date/budget flags, constraint counts and intensity).
The original goal, context, constraints, non-negotiables, refinement
instructions and provider prompts are not persisted. Deleting an operation
cascades its revisions and request records; the audit keeps only identifiers,
action, actor and timestamp.

`currentProposalRevisionId` and `readyProposalRevisionId` are UUID foreign keys
to `AiProposalRevision`. A deferred PostgreSQL trigger verifies that either
revision belongs to the same operation. The ready transition records the exact
current revision atomically; later refinements are rejected, so Stage 7 can
convert that revision without consulting mutable browser state.

Guest proposals are kept in `sessionStorage` under the independent
`guest-session:temporary-planner-state:ai-proposals` namespace. Existing guest
planner data remains in the `plans` namespace. Entries are bounded to three
operations, nine revisions per operation and 220 KiB. Expired or malformed
entries are removed. Guest content is never copied to localStorage, URLs,
logs, audit records or BroadcastChannel messages. This browser boundary is
session-scoped, not durable: closing the tab or restarting the Node process can
discard it. The server's in-memory guest idempotency cache is not a security
boundary and is unsuitable for multiple instances or billable providers.

Every guest generation/refinement/ready/reject response rotates a signed token.
The proposal token contains only the guest-session hash, operation, revision,
proposal checksum, language, status, approved structured planning controls and
expiry; it contains neither the prompt nor a generated plan. Refinement and transitions validate the
guest cookie, CSRF token, signature, operation/revision, strict proposal schema
and canonical checksum before provider use. A token from another session or a
previous revision is rejected. Ready and rejected states are server-validated.

Production requires an independent `AI_GUEST_SESSION_SIGNING_KEY` containing
at least 32 characters (64 random hexadecimal characters are recommended).
Missing configuration is treated as a startup error so a deployment cannot
appear healthy while normal guest proposal sessions are unavailable.

Authenticated provider calls follow three short phases: reserve the operation
and lease in a transaction, call the selected provider outside any transaction,
then verify the lease and persist the immutable revision in a short transaction.
Expired leases are repaired in bounded batches: pending generation becomes
`FAILED/AI_PROVIDER_INTERRUPTED`; refinement returns to `PROPOSED` and retains
the prior revision. Expiration (`expiresAt`) and physical purge (`purgeAfter`)
are separate; expired records remain read-only during the seven-day grace
period before cleanup.

Mock usage is factual: request ID is deterministic and token/cost fields are
`null`; no usage is fabricated. Input checks reject clear credentials before
provider invocation, and proposal strings render as text under the existing
Helmet/CSP policy.

## OpenAI activation

The OpenAI implementation uses the official Node SDK, Responses API and a
strict Structured Output envelope for the planning turn. The API key is read
only by the backend. Requests have a bounded timeout, SDK retries are disabled,
and NorthStar performs one retry only when structured output is invalid. Raw
prompts and responses are never logged. Configure:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=REPLACE_WITH_A_BACKEND_SECRET
OPENAI_PROPOSAL_MODEL=replace-with-an-available-gpt-5.6-model
OPENAI_CONVERSION_MODEL=replace-with-an-available-gpt-5.6-model
OPENAI_TIMEOUT_MS=60000
```

If `AI_PROVIDER` is absent it defaults to `mock`. If it is explicitly set to
`openai`, a missing key is a startup configuration error.

## Canonical plan conversion

Accepting a proposal stores the exact immutable `readyProposalRevisionId`.
Conversion reads that relation directly and never selects the latest revision.
The provider returns only canonical plan JSON v8 through Structured Outputs.
The server then runs strict Zod parsing, semantic validation, deterministic
serialization, the 256 KiB size limit, and SHA-256 checksum validation. One
repair attempt is permitted; invalid output is never persisted as a plan.

Authenticated previews are stored on the owned `AiOperation`. Confirmation is
server-first and transactional: `Plan` revision 1, `PlanVersion` revision 1
with source `AI_GENERATION` and its nullable `aiOperationId`, completion audit,
and the operation's `createdPlanId` are committed together. A retry returns the
same plan.

Guest conversion does not access PostgreSQL. The signed result contains only
the operation identifier, accepted revision, checksum, expiry, and session
binding—not the plan. The canonical plan remains in the existing scoped
`sessionStorage` boundary, is displayed as local-only, and disappears with the
browser session. Saving it to an account remains an explicit per-plan action.
