#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${PROJECT_ROOT}/dist/"
TARGET_DIR="/var/www/planner.domoforge.com/"

echo "Publishing NorthStar Planner..."
echo "Source: ${SOURCE_DIR}"
echo "Target: ${TARGET_DIR}"

if [[ ! -f "${SOURCE_DIR}index.html" ]]; then
  echo "Error: dist/index.html was not found."
  echo "Run npm run build before publishing."
  exit 1
fi

if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "Error: target directory does not exist: ${TARGET_DIR}"
  exit 1
fi

rsync \
  --archive \
  --delete \
  --human-readable \
  "${SOURCE_DIR}" \
  "${TARGET_DIR}"

echo "Verifying published index.html..."

if ! cmp -s "${SOURCE_DIR}index.html" "${TARGET_DIR}index.html"; then
  echo "Error: published index.html does not match the build."
  exit 1
fi

echo "Publish completed successfully."