#!/usr/bin/env python3
"""PostToolUse hook — record REAL subagent dispatches, so dispatch evals can later be
derived from collected data instead of invented.

Wired in .claude/settings.json on Task|Agent. Appends one JSON line per dispatch to
.ai/observability/dispatches.jsonl (gitignored).

WHY THIS EXISTS
---------------
`evals/src/mine-transcripts.ts` tried to reconstruct routing from session transcripts alone and
could not: between a human turn and the dispatch sits a long orchestration chain, so "last human
turn" attributes wrongly (an `onion-architecture` activation was traced to a message about a
DIFFERENT project). A transcript records that routing happened, not what caused it.

So this hook captures, at the moment of dispatch, the two things the transcript can't give you
afterwards:
  * `turns_since_human` — how far the dispatch is from the human turn. Small distance means the
    human prompt plausibly caused it, and the pair is safe to turn into a `dispatch` eval case.
    Large distance means it was orchestrator-driven; do NOT claim the prompt caused it.
  * `reason` — the assistant's own text in the same message as the dispatch, i.e. the stated
    rationale at decision time.

Fails OPEN, always: any error exits 0 with no output. A hook that breaks dispatching would be far
worse than a hook that silently misses a record.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

MAX_PROMPT = 2000
MAX_REASON = 1000
MAX_HUMAN = 2000

# Kept in sync with evals/src/mine-transcripts.ts — harness-generated turns carry role `user` but
# nobody typed them, so they must never be recorded as the human prompt.
SYNTHETIC = re.compile(
    r"^\s*<(task-notification|system-reminder|local-command|command-name|command-message)\b"
)
MIN_HUMAN_CHARS = 60

SECRETS = [
    re.compile(r"\b(?:sk|pk|gho|ghp|ghu|ghs|ghr)-[A-Za-z0-9_-]{16,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{20,}", re.I),
]


def redact(s):
    for pat in SECRETS:
        s = pat.sub("[REDACTED]", s)
    return s


def clip(s, n):
    s = redact((s or "").strip())
    return s if len(s) <= n else s[:n] + "…[clipped]"


def human_text(entry):
    """A genuine typed human turn, or None."""
    if entry.get("type") != "user" or entry.get("isMeta"):
        return None
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
            return None
        text = "\n".join(
            b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
        )
    else:
        return None
    text = (text or "").strip()
    if not text or SYNTHETIC.match(text) or "<system-reminder>" in text:
        return None
    return text if len(text) >= MIN_HUMAN_CHARS else None


def blocks(entry):
    content = (entry.get("message") or {}).get("content")
    return content if isinstance(content, list) else []


def read_transcript(path):
    entries = []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except Exception:
                    continue
    except Exception:
        return []
    return entries


def context_for_dispatch(entries):
    """Walk back from the newest dispatch: its stated reason, the human turn, and the distance."""
    idx = None
    for i in range(len(entries) - 1, -1, -1):
        if any(
            isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") in ("Task", "Agent")
            for b in blocks(entries[i])
        ):
            idx = i
            break
    if idx is None:
        return "", "", None

    # The rationale is NOT in the dispatch message: across 153 recorded dispatches, not one carried
    # assistant text alongside the tool_use. The narration is its own assistant message just before,
    # so walk back to the nearest one that has text.
    reason = ""
    distance = 0
    for j in range(idx - 1, -1, -1):
        h = human_text(entries[j])
        if h:
            return reason, h, distance
        if not reason and entries[j].get("type") == "assistant":
            text = "\n".join(
                b.get("text", "")
                for b in blocks(entries[j])
                if isinstance(b, dict) and b.get("type") == "text"
            ).strip()
            if text:
                reason = text
        distance += 1
    return reason, "", None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool_input = data.get("tool_input") or {}
    subagent = tool_input.get("subagent_type")
    if not subagent:
        sys.exit(0)  # not a subagent dispatch we can attribute

    reason, human, distance = context_for_dispatch(read_transcript(data.get("transcript_path") or ""))

    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "session": data.get("session_id"),
        "tool": data.get("tool_name"),
        "subagent_type": subagent,
        "description": clip(tool_input.get("description", ""), 200),
        "dispatch_prompt": clip(tool_input.get("prompt", ""), MAX_PROMPT),
        "reason": clip(reason, MAX_REASON),
        "human_prompt": clip(human, MAX_HUMAN),
        # None = no human turn found in this transcript. Small (0-2) = safe to attribute.
        "turns_since_human": distance,
    }

    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    out_dir = os.path.join(root, ".ai", "observability")
    try:
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "dispatches.jsonl"), "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception:
        pass  # fail open — never disturb the dispatch

    sys.exit(0)


if __name__ == "__main__":
    main()
