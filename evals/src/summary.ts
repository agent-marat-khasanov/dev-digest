/**
 * eval:summary — render the LAST recorded run as a markdown table on stdout.
 *
 * Exists so CI reporting is one declarative line of YAML:
 *
 *   pnpm eval:summary >> "$GITHUB_STEP_SUMMARY"
 *
 * Read-only over `results/records.jsonl`; never a gate. Vitest's exit code is what fails a
 * build — this only explains WHY, in a form a human reads without opening the artifact.
 */

import { loadRecords, type EvalRecord } from "./records/stats.js";

/** skills/agents/workflow, derived from the eval file's path (the tier IS the folder). */
function tierOf(r: EvalRecord): string {
  const m = r.nodeid.match(/\/(skills|agents|workflow)\//);
  return m ? m[1]! : "other";
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

function cell(v: number | undefined, digits = 2): string {
  return v === undefined ? "—" : v.toFixed(digits);
}

function main(): void {
  const all = loadRecords();
  if (all.length === 0) {
    console.log("_No eval records yet — `results/records.jsonl` is empty._");
    return;
  }

  // run_id is a sortable timestamp (YYYYmmddTHHMMSS); the last one is the run we just did.
  const runId = all.reduce((max, r) => (r.run_id > max ? r.run_id : max), all[0]!.run_id);
  const rows = all.filter((r) => r.run_id === runId);
  const first = rows[0]!;

  const passed = rows.filter((r) => r.outcome).length;
  console.log(`### Evals — ${passed}/${rows.length} passed (${pct(passed, rows.length)})`);
  console.log("");
  console.log(
    `\`${runId}\` · commit \`${first.git_sha}${first.dirty ? "-dirty" : ""}\` · config \`${first.config}\``,
  );
  console.log("");

  const tiers = [...new Set(rows.map(tierOf))].sort();
  for (const tier of tiers) {
    const inTier = rows.filter((r) => tierOf(r) === tier);
    const tierPassed = inTier.filter((r) => r.outcome).length;
    console.log(`#### ${tier} — ${tierPassed}/${inTier.length}`);
    console.log("");
    console.log("| | Case | Score | Threshold | Turns | Tokens out |");
    console.log("|---|---|---|---|---|---|");
    for (const r of inTier) {
      // Escape pipes so a case name with one can't break the table.
      const name = r.label.replace(/\|/g, "\\|");
      console.log(
        `| ${r.outcome ? "✅" : "❌"} | ${name} | ${cell(r.score)} | ${cell(r.threshold)} | ${r.num_turns} | ${r.metrics.outputTokens} |`,
      );
    }
    console.log("");
  }

  // Failing practices are the actionable part of a red run — surface them without the artifact.
  const failedPractices = rows
    .filter((r) => !r.outcome)
    .flatMap((r) => r.practices.filter((p) => !p.passed).map((p) => ({ label: r.label, ...p })));
  if (failedPractices.length > 0) {
    console.log("<details><summary>Failed practices</summary>");
    console.log("");
    for (const p of failedPractices) {
      console.log(`- **${p.label}** — ${p.practice}`);
    }
    console.log("");
    console.log("</details>");
  }
}

main();
