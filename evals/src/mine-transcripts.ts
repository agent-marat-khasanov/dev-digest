/**
 * eval:mine — extract REAL routing events from this project's Claude Code session transcripts,
 * so dispatch/activation cases are derived from what actually happened instead of invented.
 *
 *   pnpm eval:mine            # summary + corpus to results/corpus.json
 *   pnpm eval:mine --agent implementer     # print the real prompts that dispatched one agent
 *   pnpm eval:mine --skill onion-architecture
 *
 * One event = (the human turn that was in play) -> (subagent dispatched | skill invoked).
 * The human turn is the eval INPUT; the dispatch/activation is the assertion.
 *
 * Output goes to `results/` (gitignored) and is NEVER committed: transcripts are raw session logs
 * and can contain anything the user pasted — including credentials. Secret-shaped strings are
 * redacted here too, as defence in depth rather than as the primary control.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { REPO_ROOT, RESULTS_DIR } from "./artifacts/paths.js";
import { GREEN, DIM, YELLOW, RESET } from "./ansi.js";

/** Claude Code stores transcripts under ~/.claude/projects/<abs-path-with-slashes-as-dashes>/. */
const PROJECT_DIR =
  process.env.EVAL_TRANSCRIPT_DIR ??
  join(homedir(), ".claude", "projects", REPO_ROOT.replace(/\//g, "-"));

/** Built-ins, not artifacts of ours — we cannot eval a subagent we don't author. */
const BUILTIN_AGENTS = new Set(["Explore", "general-purpose", "Plan", "claude", "fork"]);

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|gho|ghp|ghu|ghs|ghr)-[A-Za-z0-9_-]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{20,}/gi,
];

function redact(s: string): string {
  return SECRET_PATTERNS.reduce((acc, re) => acc.replace(re, "[REDACTED]"), s);
}

export interface RoutingEvent {
  kind: "dispatch" | "activation";
  /** Subagent type or skill name. */
  target: string;
  /** The human turn in play when it happened — the eval input. */
  prompt: string;
  session: string;
}

/**
 * Harness-generated turns that Claude Code surfaces with role `user`. These are NOT things a person
 * typed, so they are useless as an eval input — and they dominate the raw counts if you don't filter
 * them (a background-agent completion notification often sits immediately before the next dispatch).
 */
const SYNTHETIC_TURN = /^\s*<(task-notification|system-reminder|local-command|command-name|command-message)\b/;
/** Below this, a turn is an acknowledgement ("Ти закінчив?"), not a task statement. */
const MIN_PROMPT_CHARS = 60;

/** A genuine typed human turn: not a tool_result, not a harness notification, not a one-liner ack. */
function humanText(entry: { type?: string; isMeta?: boolean; message?: { content?: unknown } }): string | null {
  if (entry.type !== "user" || entry.isMeta) return null;
  const c = entry.message?.content;
  let text: string | null = null;
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    if (c.some((b: { type?: string }) => b?.type === "tool_result")) return null;
    text =
      c
        .filter((b: { type?: string }) => b?.type === "text")
        .map((b: { text?: string }) => b.text ?? "")
        .join("\n") || null;
  }
  if (!text) return null;
  const trimmed = text.trim();
  if (SYNTHETIC_TURN.test(trimmed)) return null;
  if (trimmed.includes("<system-reminder>")) return null;
  if (trimmed.length < MIN_PROMPT_CHARS) return null;
  return trimmed;
}

/**
 * Collapse repeats of the same (target, prompt). One human instruction routinely fans out into many
 * dispatches of the same agent (52 `implementer` events came from a handful of instructions), and
 * counting those as 52 data points would badly overstate how much evidence we actually have.
 */
export function distinct(events: RoutingEvent[]): RoutingEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.kind}|${e.target}|${e.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mine(): RoutingEvent[] {
  if (!existsSync(PROJECT_DIR)) {
    console.error(`${YELLOW}no transcripts at${RESET} ${PROJECT_DIR}`);
    console.error(`Set EVAL_TRANSCRIPT_DIR if your Claude Code stores them elsewhere.`);
    return [];
  }
  const events: RoutingEvent[] = [];

  for (const file of readdirSync(PROJECT_DIR).filter((f) => f.endsWith(".jsonl"))) {
    const session = file.replace(/\.jsonl$/, "");
    let lines: string[];
    try {
      lines = readFileSync(join(PROJECT_DIR, file), "utf8").split("\n").filter(Boolean);
    } catch {
      continue;
    }
    let lastHuman = "";
    for (const line of lines) {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const human = humanText(entry);
      if (human) {
        lastHuman = redact(human).trim();
        continue;
      }
      const content = (entry.message as { content?: unknown } | undefined)?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content as Array<{ type?: string; name?: string; input?: Record<string, string> }>) {
        if (block.type !== "tool_use" || !lastHuman) continue;
        if (block.name === "Task" || block.name === "Agent") {
          const target = block.input?.subagent_type;
          if (target && !BUILTIN_AGENTS.has(target)) {
            events.push({ kind: "dispatch", target, prompt: lastHuman, session });
          }
        } else if (block.name === "Skill") {
          const target = block.input?.skill;
          // Plugin skills arrive as `plugin:skill` — only ours live in .ai/skills.
          if (target && !target.includes(":")) {
            events.push({ kind: "activation", target, prompt: lastHuman, session });
          }
        }
      }
    }
  }
  return events;
}

function tally(events: RoutingEvent[], kind: RoutingEvent["kind"]): [string, number][] {
  const counts = new Map<string, number>();
  for (const e of events.filter((x) => x.kind === kind)) {
    counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function main(): void {
  const raw = mine();
  if (raw.length === 0) return;
  const events = distinct(raw);

  const argv = process.argv.slice(2);
  const agentIdx = argv.indexOf("--agent");
  const skillIdx = argv.indexOf("--skill");
  if (agentIdx !== -1 || skillIdx !== -1) {
    const kind = agentIdx !== -1 ? "dispatch" : "activation";
    const target = argv[(agentIdx !== -1 ? agentIdx : skillIdx) + 1];
    const hits = events.filter((e) => e.kind === kind && e.target === target);
    console.log(`\n${hits.length} real ${kind} event(s) for ${GREEN}${target}${RESET}\n`);
    hits.forEach((h, i) => {
      // First ~400 chars is enough to judge whether a prompt is a usable eval input.
      console.log(`${DIM}--- [${i + 1}] session ${h.session.slice(0, 8)} ---${RESET}`);
      console.log(h.prompt.slice(0, 400).replace(/\n+/g, " ⏎ "));
      console.log("");
    });
    return;
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, "corpus.json");
  writeFileSync(out, JSON.stringify(events, null, 2));

  console.log(`\n${"=".repeat(60)}\nReal dispatches (our agents only)\n${"=".repeat(60)}`);
  for (const [target, n] of tally(events, "dispatch")) console.log(`  ${target.padEnd(28)} ${n}`);
  console.log(`\n${"=".repeat(60)}\nReal skill activations\n${"=".repeat(60)}`);
  for (const [target, n] of tally(events, "activation")) console.log(`  ${target.padEnd(28)} ${n}`);
  console.log(
    `\n${events.length} DISTINCT (prompt → target) pairs from ${raw.length} raw events → ${out}`,
  );
  console.log(`${DIM}gitignored — never commit; transcripts are raw session logs${RESET}`);
  console.log(`Inspect one:  pnpm eval:mine --agent <name>  |  --skill <name>\n`);
}

main();
