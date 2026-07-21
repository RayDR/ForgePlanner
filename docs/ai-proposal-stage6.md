# AI proposal engine (Stage 6)

Stage 6 is deliberately limited to a deterministic mock provider. It stops at
`READY_FOR_CONVERSION` and never creates a canonical `Plan`, `PlanVersion`, or
calls an external AI provider.

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
The token contains only the guest-session hash, operation, revision, proposal
checksum, language, status and expiry. Refinement and transitions validate the
guest cookie, CSRF token, signature, operation/revision, strict proposal schema
and canonical checksum before provider use. A token from another session or a
previous revision is rejected. Ready and rejected states are server-validated.

Authenticated provider calls follow three short phases: reserve the operation
and lease in a transaction, call the mock provider outside any transaction,
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
