/* Groups flat per-case eval-run rows (`GET /agents/:id/eval-runs`) into
   run-all "batches" — shared by CompareView and TrendChart so both render at
   batch granularity (AC-27/AC-34). Mirrors the backend's batch aggregation
   (server/src/modules/evals/service.ts `groupByBatch`/`aggregateBatch`/
   `chronologicalBatches`) so client and server numbers agree: recall/
   precision/citation_accuracy are the mean across the batch's scored cases,
   cost_usd is the sum, ran_at is the batch's latest case timestamp, and a
   run without a `batch_id` (single-case run) is its own one-row batch keyed
   by its own run id. */

import type { EvalRunRecord } from "@devdigest/shared";

export interface EvalBatch {
  batchId: string;
  ran_at: string;
  agent_version: number | null;
  recall: number;
  precision: number;
  citation_accuracy: number;
  cost_usd: number | null;
  passed: number;
  total: number;
}

export function groupRunsByBatch(runs: EvalRunRecord[]): EvalBatch[] {
  const groups = new Map<string, EvalRunRecord[]>();
  for (const r of runs) {
    const key = r.batch_id ?? r.id;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.entries()]
    .map(([batchId, caseRuns]) => aggregateBatch(batchId, caseRuns))
    .sort((a, b) => a.ran_at.localeCompare(b.ran_at));
}

function aggregateBatch(batchId: string, runs: EvalRunRecord[]): EvalBatch {
  const scored = runs.filter(
    (r) => r.recall !== null && r.precision !== null && r.citation_accuracy !== null,
  );
  const avg = (sel: (r: EvalRunRecord) => number | null): number =>
    scored.length > 0 ? scored.reduce((sum, r) => sum + (sel(r) ?? 0), 0) / scored.length : 0;
  const costs = runs.filter((r): r is EvalRunRecord & { cost_usd: number } => r.cost_usd !== null);
  const latestTimestamp = Math.max(...runs.map((r) => new Date(r.ran_at).getTime()));
  return {
    batchId,
    ran_at: new Date(latestTimestamp).toISOString(),
    agent_version: runs[0]!.agent_version,
    recall: avg((r) => r.recall),
    precision: avg((r) => r.precision),
    citation_accuracy: avg((r) => r.citation_accuracy),
    cost_usd: costs.length > 0 ? costs.reduce((sum, r) => sum + r.cost_usd, 0) : null,
    passed: runs.filter((r) => r.pass === true).length,
    total: runs.length,
  };
}
