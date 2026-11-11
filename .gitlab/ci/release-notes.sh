#!/bin/sh
set -e

PREVIOUS=$(git describe --tags --abbrev=0 "$CI_COMMIT_TAG^" 2>/dev/null || true)
RANGE="${PREVIOUS:+$PREVIOUS..}$CI_COMMIT_TAG"

section() {
  lines=$(git log "$RANGE" --no-merges --pretty='%s' | grep -E "$2" | sed -E 's/^[a-z]+(\([^)]*\))?!?: /- /' || true)
  if [ -n "$lines" ]; then
    printf '## %s\n\n%s\n\n' "$1" "$lines"
  fi
}

section '🚩 Breaking Changes' '^[a-z]+(\([^)]*\))?!: '
section '🚀 Features' '^feat(\([^)]*\))?: '
section '🐛 Fixes' '^fix(\([^)]*\))?: '
section '⚡ Performance' '^perf(\([^)]*\))?: '

if [ -n "$PREVIOUS" ]; then
  echo "**Full Changelog**: $CI_PROJECT_URL/-/compare/$PREVIOUS...$CI_COMMIT_TAG"
fi
