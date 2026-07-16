# NorthStar Planner

NorthStar Planner is a React/Vite planner backed by a modular Node/Express API. PostgreSQL stores users, sessions, authorization, ownership and audit records; each plan remains a portable JSON snapshot stored as JSONB. Existing Zustand/localStorage plans are preserved until the user explicitly downloads a backup and imports them.

## Stack and structure

- React 19, TypeScript, Vite and React Router
- Zustand for planner state and the existing local persistence contract
- Express, Zod and structured Pino logging
- PostgreSQL with Prisma and versioned migrations
- `src/`: planner, authentication and administration UI
- `server/`: API modules, authorization, email and security services
- `prisma/`: schema, migrations and idempotent RBAC/admin seed
- `config/`: safe configuration examples; completed secret files must not be committed
- `deploy/`: Nginx and service deployment configuration
- `docs/`: architecture and production activation details

## Implemented multiuser features

### Authentication and profile

- registration, login, current session, logout and logout-all
- Argon2id password hashes and opaque server-side sessions
- Google OAuth and score-based reCAPTCHA integration points
- public profile code in `handle#1234` format
- editable public profile with display name, handle, biography, avatar URL, timezone and search visibility
- language and theme preferences persisted in the authenticated profile
- persisted language and theme preferences
- protected public/authenticated/administrative routes
- password recovery with hashed, expiring, single-use tokens
- previous sessions are revoked after a successful password reset
- hashed, expiring and single-use email verification links with generic resend responses
- optional registration enforcement through `EMAIL_VERIFICATION_REQUIRED`; Google identities are verified automatically
- account session/device listing, current-session identification and individual revocation
- masked IP display and throttled last-activity updates

### Plans and migration

- PostgreSQL ownership with complete JSONB snapshots
- CRUD policies based on the authenticated session, never a client-provided owner ID
- explicit, idempotent local plan import using `importKey`
- downloadable JSON backup before migration
- local data is not automatically deleted after importing
- owner, editor and viewer access levels
- exact public-code search without exposing email addresses
- invitation acceptance, rejection, permission changes and revocation
- archived-plan privacy that suspends collaborator access without deleting the access list
- explicit, confirmed permanent deletion with an immutable audit event
- backend-enforced viewer read-only access
- per-plan revisions with atomic optimistic-concurrency checks
- bilingual conflict resolution that can load the remote version or intentionally keep local changes

### Administration and audit

- protected `/admin` user and audit interface
- user search, status changes and role management
- protection against self-demotion and disabling the last active administrator
- active sessions revoked when an account is suspended or disabled
- one-hour, non-chainable impersonation with a required reason
- persistent impersonation banner and explicit termination control
- separate `actorUserId` and `effectiveUserId` audit identities
- target-user permissions are applied during impersonation
- sensitive administrative operations are blocked while impersonating

### Notifications

- in-app notification inbox and unread counter in the shared header
- translated plan invitation, acceptance and rejection notifications
- individual and bulk read state
- per-user preferences for invitations, responses and future email delivery

### Collaboration

- organizations with owner, administrator and member roles
- organization membership through exact public profile codes
- private direct conversations between authenticated users
- persisted message history with participant-level authorization

### SMTP and email security

- provider abstraction with SMTP implementation
- database configuration with environment fallback
- SMTP password encrypted using AES-256-GCM
- the master key exists only in the local ignored environment file
- the API returns `passwordConfigured`, never plaintext or ciphertext
- administrative SMTP editor and test-delivery action
- delivery logs contain only a recipient hash
- password reset HTML and plain-text defaults stored outside application code
- editable, versioned database overrides with safe-tag validation, preview and default restoration

SMTP is intentionally disabled when credentials fail verification. A stale or rejected password is removed rather than retained. Replace it through `Administration → Email`, test delivery, and only then enable it.

## Local development

Requirements: Node.js 22+ and PostgreSQL 15+.

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
npm run dev:all
```

The client runs at `http://localhost:5173`; Vite proxies `/api` to `http://127.0.0.1:4100`.

## Initial administrator

There is no default password. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters) and optionally `ADMIN_DISPLAY_NAME`, then run:

```bash
npm run db:seed
```

The seed is idempotent. It creates a missing administrator or grants the `admin` and `user` roles to an existing account without changing its password.

To promote an existing production account using the local runtime environment:

```bash
set -a
source api.env.local
set +a
ADMIN_EMAIL="admin@example.com" npm run db:seed
```

## SMTP configuration

Generate the encryption key once and keep it outside Git:

```bash
openssl rand -base64 32
```

Store it as `EMAIL_ENCRYPTION_KEY` in the protected runtime environment. `api.env.local` is ignored by Git and must use mode `0600`.

A safe template is available at [`config/email-settings.example.json`](config/email-settings.example.json). An existing environment configuration can be imported without printing its values:

```bash
npm run smtp:import -- /secure/path/source.env api.env.local
```

The importer creates the master key when absent, encrypts the SMTP password before PostgreSQL persistence and never copies plaintext into tracked files.

## API overview

- `/api/auth/*`: registration, sessions, OAuth and password recovery
- `/api/auth/email-verification/*`: verification-link request and confirmation
- `/api/profile`, `/api/profiles/search`: profile preferences and public lookup
- `/api/plans/*`: ownership, JSONB persistence, import and sharing
- `/api/admin/users/*`: protected user administration
- `/api/admin/impersonation`: start/end impersonation
- `/api/admin/audit-logs`: protected audit query
- `/api/admin/settings/email`: SMTP configuration and delivery test

See [`docs/multiuser-architecture.md`](docs/multiuser-architecture.md) for the endpoint list and authorization model.

Plan sharing supports a master access lock that preserves the collaborator list and general link. Owners can grant view or edit access per person, create an authenticated general link with view or edit permission, disable that link without deleting it, or remove it permanently. These permissions are enforced by the API, not only by the interface.

## Security properties

- `HttpOnly`, `SameSite=Strict` and production `Secure` session cookies
- only SHA-256 session and password-reset token hashes are stored
- separate CSRF double-submit token verified against its database hash
- restricted CORS, Helmet, payload limits and rate limiting
- generic authentication/recovery responses
- centralized RBAC and resource ownership checks
- no passwords, cookies, OAuth secrets or SMTP plaintext in localStorage
- sensitive log fields are redacted
- audit records are immutable through the public API

## Validation

```bash
npm run lint
npx tsc -b --pretty false
npm run build:api
npm test
npm run build
npm audit
```

## Production

Production activation and database/API order are documented in [`docs/production-activation.md`](docs/production-activation.md). The Nginx API proxy example is in [`docs/nginx-api.conf.example`](docs/nginx-api.conf.example).

The production health check must return JSON, not the SPA:

```bash
curl https://planner.domoforge.com/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Remaining roadmap

- organization channels, message editing/deletion and delivery/read receipts

Do not commit completed `.env`, `*.local`, SMTP passwords, OAuth credentials or encryption keys.
