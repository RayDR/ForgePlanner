# ForgePlanner

ForgePlanner turns a goal into a clear, editable roadmap. A user can plan manually or have **NorthStar AI** ask focused questions, produce a human-readable proposal, refine an immutable proposal revision, and convert the exact accepted revision into a validated canonical plan.

- Demo: [planner.domoforge.com](https://planner.domoforge.com/)
- Source: [github.com/RayDR/ForgePlanner](https://github.com/RayDR/ForgePlanner) (public)
- Languages: English and Spanish
- Guest evaluation: no account or rebuild required
- OpenAI Build Week 2026 project

## Problem and solution

Long-term goals often begin as an unstructured idea. Generic generated checklists are difficult to trust, adapt, or track. ForgePlanner separates discovery, review, conversion, and execution:

1. Describe a goal in natural language.
2. NorthStar AI asks one useful clarification at a time.
3. Review and refine a readable proposal.
4. Accept one exact immutable revision.
5. Convert it into canonical plan JSON v8 and validate it server-side.
6. Open the annual roadmap or monthly planner and keep editing.

The assistant states assumptions and warnings and does not promise outcomes. Manual creation remains fully available.

## Screenshots

Production screenshots are stored in [`docs/screenshots`](docs/screenshots):

- [ForgePlanner landing page](docs/screenshots/forgeplanner-home.png)
- [NorthStar AI planning workspace](docs/screenshots/northstar-ai-workspace.png)

## Architecture

- React 19, TypeScript, Vite, React Router and Zustand
- Node.js/Express API with Zod validation and structured Pino logging
- PostgreSQL and Prisma for users, sessions, ownership, AI operations, plans, and immutable versions
- Portable canonical plan schema v8 stored as JSONB
- OpenAI Responses API with strict Structured Outputs behind a provider abstraction
- Identity-scoped browser persistence for guest and authenticated state
- Session-only guest AI proposals and generated plans

The browser never decides server authorization. Authenticated mutations use the immutable user UUID from the session. `PlanRevisionService` atomically writes `Plan` and `PlanVersion`; server-backed plans remain authoritative.

More detail:

- [Canonical plan contract](docs/plan-contract.md)
- [AI proposal and conversion lifecycle](docs/ai-proposal-stage6.md)
- [Immutable version history](docs/plan-version-history.md)
- [Multiuser architecture](docs/multiuser-architecture.md)

## How GPT-5.6 is used

NorthStar AI uses GPT-5.6 through the backend only:

- conversational discovery returns one structured `ASK` or `PROPOSE` decision;
- proposal refinement creates a new immutable proposal revision;
- conversion receives the exact `readyProposalRevisionId` content and returns canonical plan JSON v8;
- the server validates structure, semantics, protected metadata, size, deterministic serialization, and checksum before showing a preview;
- authenticated confirmation creates exactly one revision-1 `Plan` and one revision-1 `PlanVersion` with source `AI_GENERATION`;
- guest conversion never writes an AI operation, plan, or version to PostgreSQL.

Mock mode implements the same application boundary for deterministic local tests. Production never silently falls back from OpenAI to mock.

## How Codex was used

Codex was the primary engineering collaborator for repository discovery, staged architecture design, TypeScript/React/API implementation, schema and migration work, test generation, production diagnostics, security review, responsive UI fixes, deployment verification, and documentation. The work was kept auditable through focused diffs, automated checks, isolated PostgreSQL integration tests, and real-provider smoke tests.

Build Week evaluators still require the project owner to run `/feedback` from an official Codex interface and paste the returned Session ID into Devpost. This repository does not invent or store that ID.

## Test the public demo without rebuilding

1. Open [ForgePlanner](https://planner.domoforge.com/) in a private browser window.
2. Choose **Plan with AI** / **Planear con IA**.
3. Dismiss the sensitive-data warning and enter a short goal.
4. Answer the assistant's clarification, refine the proposal if desired, and accept it.
5. Review the generated preview and create the plan.
6. The guest plan opens as **LOCAL ONLY / SOLO LOCAL** and remains in the current browser session.
7. Registration is optional. Signing in never transfers a guest plan automatically; **Save to my account** synchronizes only the chosen plan.

The same demo supports manual plan creation, annual roadmaps, monthly planning, savings tracking, English/Spanish, and light/dark themes.

## Local development

Requirements: Node.js 22+ and PostgreSQL 15+.

```bash
cp .env.example .env
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev:all
```

The client runs at `http://localhost:5173`; Vite proxies `/api` to `http://127.0.0.1:4100`.

### Mock-mode evaluation

Use safe values in `.env` and keep the provider deterministic:

```dotenv
NODE_ENV=development
AI_PROVIDER=mock
AI_GUEST_SESSION_SIGNING_KEY=replace-with-at-least-32-random-characters
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/forgeplanner_dev?schema=public
```

No OpenAI key is required in mock mode. Run `npm run dev:all`, open `/plans`, and select the single creation card to exercise manual or AI creation.

### Real OpenAI activation

Put secrets only in an ignored backend runtime file such as `api.env.local`, set its mode to `0600`, and never use a `VITE_` prefix:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=replace-with-a-server-only-secret
OPENAI_PROPOSAL_MODEL=replace-with-an-available-gpt-5.6-model
OPENAI_CONVERSION_MODEL=replace-with-an-available-gpt-5.6-model
OPENAI_TIMEOUT_MS=60000
AI_GUEST_SESSION_SIGNING_KEY=replace-with-at-least-32-random-characters
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/forgeplanner?schema=public
```

The production process must load this file only in the backend. Restart only the API, check `/api/health`, and confirm the safe startup fields without logging any secret. See [production activation](docs/production-activation.md).

## Environment variables

`.env.example` documents authentication, PostgreSQL, SMTP, Google OAuth, reCAPTCHA, OpenAI, rate-limit, and session settings without real values. Important AI variables are:

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | Explicit `mock` or `openai` provider selection |
| `OPENAI_API_KEY` | Backend-only provider credential |
| `OPENAI_PROPOSAL_MODEL` | Conversational discovery/refinement model |
| `OPENAI_CONVERSION_MODEL` | Canonical v8 conversion model |
| `OPENAI_TIMEOUT_MS` | Bounded provider request timeout |
| `AI_GUEST_SESSION_SIGNING_KEY` | Signs guest proposal and conversion state |

Do not commit completed `.env`, `*.local`, OAuth/SMTP secrets, database credentials, or generated key material.

## Validation

```bash
npm run lint
npx tsc -b --pretty false
npm test -- --run
npm run test:integration
npm run build:api
npm run build
git diff --check
```

`test:integration` refuses to run unless `TEST_DATABASE_URL` points to a database or schema whose name contains `test`; it never reuses production `DATABASE_URL`.

## Privacy and security

- API keys and provider requests remain server-side and raw prompts/responses are not logged.
- Sensitive-input checks reject obvious credentials before provider invocation.
- Guest AI state uses tab-scoped `sessionStorage`, not ordinary `localStorage`.
- Guest data is never silently assigned to an authenticated account.
- Session cookies are `HttpOnly`, `Secure` in production, and `SameSite=Strict`.
- PostgreSQL ownership and collaborator permissions are enforced atomically by the API.
- OpenAI output is untrusted until strict v8 structure and semantic checks pass.

Public pages: [Privacy Policy](https://planner.domoforge.com/privacy), [Terms of Service](https://planner.domoforge.com/terms), and contact at [hello@domoforge.com](mailto:hello@domoforge.com).

## Known limitations

- Guest AI plans are intentionally session-only and disappear when that browser session ends unless explicitly saved to an account.
- Exact provider cost is not calculated when current pricing is not returned by the provider.
- AI suggestions require human review and are not professional legal, medical, immigration, or financial advice.
- Organization channels, message editing/deletion, and delivery/read receipts remain future work.

## Build Week submission checklist

- Public demo works without rebuilding and supports guest testing.
- Repository includes setup, mock mode, real-provider activation, tests, architecture, privacy, and security documentation.
- Landing, sign-in, registration, continue-as-guest planning, Privacy, Terms, and contact information are public.
- This project was built during OpenAI Build Week 2026 using Codex and GPT-5.6.

Manual Devpost steps remain the project owner's responsibility:

- run `/feedback` in an official Codex interface and record the Session ID;
- upload a public or unlisted video of about three minutes with voiceover;
- explain Codex and GPT-5.6 and show questions, refinement, conversion, and the opened planner;
- verify the video reveals no secrets or private data;
- verify the project appears under **My Projects** with green **Submitted** status, team invitations are accepted, and the repository/video links work.
