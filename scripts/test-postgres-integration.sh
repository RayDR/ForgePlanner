#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  echo "TEST_DATABASE_URL is required for PostgreSQL integration tests." >&2
  exit 2
fi

if [[ -n "${DATABASE_URL:-}" && "${TEST_DATABASE_URL}" == "${DATABASE_URL}" ]]; then
  echo "TEST_DATABASE_URL must not equal DATABASE_URL." >&2
  exit 2
fi

node -e 'const url = new URL(process.env.TEST_DATABASE_URL); const database = url.pathname.slice(1); if (!/(^|[_-])test([_-]|$)/i.test(database) && !/^test_/i.test(url.searchParams.get("schema") ?? "")) { console.error("The integration database or schema name must be explicitly marked as test."); process.exit(2) }'

DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate deploy
TEST_DATABASE_URL="${TEST_DATABASE_URL}" npx vitest run --no-file-parallelism server/modules/plans/plan.integration.test.ts server/modules/plans/plan-version.integration.test.ts server/modules/ai/ai.integration.test.ts
