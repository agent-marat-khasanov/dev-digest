#!/usr/bin/env python3
"""PreToolUse hook — skill-routing reminder.

Wired in .claude/settings.json on Edit|Write. Reads the tool-call JSON on stdin,
looks at the target file path, and (for code paths only) injects a non-blocking
`additionalContext` reminder to invoke the placement/framework skills first — the
deterministic backstop for the ~50%-activation problem documented in
.ai/skills/INSIGHTS.md. Fires in the main session AND inside subagents.

Safe by design: it only ever NUDGES (additionalContext). To make it STRICT (block
the edit until the skill is invoked) switch the output to
{"hookSpecificOutput": {"hookEventName": "PreToolUse",
 "permissionDecision": "deny", "permissionDecisionReason": msg}} — but that risks
false-positives on legitimate non-routed edits, so we ship the reminder variant.
"""
import json
import re
import sys


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # never block on a parse error

    path = ((data.get("tool_input") or {}).get("file_path") or "").replace("\\", "/")
    if not path:
        sys.exit(0)

    skills: list[str] = []

    def add(*names: str) -> None:
        for n in names:
            if n not in skills:
                skills.append(n)

    is_test = bool(re.search(r"\.(test|it\.test)\.(ts|tsx)$", path))

    if "/client/" in path:
        add("frontend-architecture")
        add("react-testing-library" if is_test else "react-best-practices / next-best-practices")
    elif "/server/" in path or "/reviewer-core/" in path:
        add("onion-architecture")  # placement first
        if "/db/" in path or "schema" in path:
            add("drizzle-orm-patterns", "postgresql-table-design")
        if re.search(r"/routes\.ts$", path) or "fastify" in path:
            add("fastify-best-practices")
        if "/vendor/shared/" in path or "/contracts/" in path:
            add("zod")
        if is_test:
            add("backend-testing")

    if not skills:
        sys.exit(0)  # not a routed code path — stay silent

    msg = (
        f"Skill-routing reminder (.ai/rules/skill-routing.md): about to edit `{path}`. "
        f"If not already done this turn, invoke the placement skill FIRST, then framework "
        f"skills via the Skill tool: {', '.join(skills)}."
    )
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": msg,
        }
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
