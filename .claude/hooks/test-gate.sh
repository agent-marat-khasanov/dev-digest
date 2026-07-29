#!/usr/bin/env bash
# PreToolUse test-gate (L06 Stretch 4) — deterministic commit gate.
#
# The reliability ladder from L02: evals measure PROBABILISTIC quality with a
# threshold; some rules must hold ALWAYS. "Don't commit with a red scorer" is
# one such rule, so it's a hook, not an eval. This blocks any Bash `git commit`
# when `pnpm verify:l06` (the deterministic eval-scorer unit test) is red.
#
# Contract: PreToolUse hooks read the tool call as JSON on stdin. Exit 0 = allow.
# Exit 2 = BLOCK the tool call (stderr is fed back to the agent). Any other exit
# is a non-blocking error, so we deliberately only ever emit 0 or 2.

input=$(cat)

# Extract the Bash command; if jq is missing or the shape is odd, fail OPEN
# (allow) rather than wedging every Bash call.
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)

# Only gate real `git commit` invocations. `git commit-graph`, `git log commit`,
# etc. won't match the word-boundary + whitespace pattern.
if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]-])git[[:space:]]+commit([[:space:]]|$)'; then
  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
  if ! ( cd "$root/server" && pnpm verify:l06 ) >/tmp/test-gate-l06.log 2>&1; then
    echo "BLOCKED by test-gate: 'pnpm verify:l06' is RED — the eval scorer regressed. Fix it before committing (log: /tmp/test-gate-l06.log)." >&2
    exit 2
  fi
fi

exit 0
