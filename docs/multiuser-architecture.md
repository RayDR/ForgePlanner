# Multiuser architecture

## Implemented: stages 1A through 1F, complete

The existing SPA was retained to avoid a destructive monorepo move. `server/` is a separate TypeScript build with modules for auth, profiles, authorization and audit. Prisma owns the PostgreSQL schema and versioned migration.

Implemented endpoints:

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `GET /api/auth/config`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `POST /api/auth/password/forgot`
- `POST /api/auth/password/reset`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/:sessionId`
- `GET /api/profile`
- `PATCH /api/profile`
- `GET /api/plans`
- `POST /api/plans`
- `POST /api/plans/import`
- `GET /api/plans/:planId`
- `PATCH /api/plans/:planId`
- `DELETE /api/plans/:planId`
- `POST /api/plans/:planId/restore`
- `DELETE /api/plans/:planId/permanent`
- `GET /api/profiles/search?code=handle%231234`
- `GET /api/plans/invitations`
- `PATCH /api/plans/access/:accessId/respond`
- `GET /api/plans/:planId/access`
- `PATCH /api/plans/:planId/access-state`
- `POST /api/plans/:planId/share-link`
- `PATCH /api/plans/:planId/share-link`
- `DELETE /api/plans/:planId/share-link`
- `GET /api/plans/link/:linkId`
- `PATCH /api/plans/link/:linkId`
- `POST /api/plans/:planId/access`
- `PATCH /api/plans/:planId/access/:accessId`
- `DELETE /api/plans/:planId/access/:accessId`
- `GET /api/admin/users`
- `GET /api/admin/users/:userId`
- `PATCH /api/admin/users/:userId`
- `POST /api/admin/impersonation`
- `DELETE /api/admin/impersonation`
- `GET /api/admin/audit-logs`
- `GET /api/admin/settings/email`
- `PATCH /api/admin/settings/email`
- `POST /api/admin/settings/email/test`
- `GET /api/admin/email-templates/:templateKey`
- `PATCH /api/admin/email-templates/:templateKey`
- `POST /api/admin/email-templates/:templateKey/preview`
- `POST /api/admin/email-templates/:templateKey/reset`

The frontend has public `/login` and `/register`, protected planner routes, `/account`, Google sign-in when configured, optional score-based reCAPTCHA, session loading/error states and redirect-after-login. Language and theme are saved to the authenticated profile and are also retained locally before login. Credentials and session tokens are never persisted by Zustand or localStorage.

## Authorization

Permissions are declared once in `server/modules/authorization/policies.ts`. Route modules use `requirePermission`; resource services added in 1E must additionally apply ownership/access policies in their database query. Viewer/editor are resource access levels, not global roles.

## Local plan transition

The current localStorage keys and snapshots are deliberately unchanged. The implemented migration flow:

1. detect a local snapshot after login;
2. offer a JSON backup;
3. validate the existing schema versions;
4. import using a stable per-owner `importKey`;
5. links the local plan to its remote identifier only after the API confirms persistence;
6. retain the local copy until the user explicitly removes it.

## Stage status

Stages 1A–1F from the original multiuser plan are implemented. This includes authentication, recovery and email, administration and impersonation, remote plan ownership/import, and sharing with viewer/editor access. Optimistic concurrency, in-app notifications, direct messaging and organizations were subsequently implemented as extensions. Owners can lock all access without deleting collaborators or links. Individual people and general links support viewer/editor permissions, enforced by the API. Permanent deletion is an explicit audited operation.

Future work is product expansion rather than an unfinished authentication stage: granular field permissions, organization-owned plans, realtime delivery and commercial billing are intentionally outside stages 1A–1F.
