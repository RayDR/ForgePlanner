# Changelog

## 0.2.0 - 2026-07-16

### Added

- Multiuser registration, login, logout, session management and password recovery.
- Email verification, encrypted SMTP configuration, Google sign-in and optional reCAPTCHA support.
- User profiles with persisted language and theme preferences.
- PostgreSQL-backed plan ownership, import and optimistic concurrency.
- Viewer/editor collaboration, invitations, notifications and authenticated sharing links.
- A master plan-sharing lock that preserves collaborators and link configuration.
- Administration, audit logs, impersonation and configurable email templates.

### Changed

- Added protected application routes and redirect-after-login behavior.
- Connected local planner data to authenticated remote plans without changing the existing JSON plan schema.
- Centralized new bilingual interface text in the application translation catalog.
- Improved responsive plan cards, account controls and collaboration actions.

### Security

- Added HTTP-only sessions, CSRF validation, rate limiting and restricted CORS.
- Added server-side ownership and viewer/editor authorization checks.
- Kept credentials and sensitive provider configuration outside tracked files.
