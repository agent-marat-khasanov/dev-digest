/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    sev_critical: null,
    sev_warning: null,
    sev_suggestion: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — severity badges", () => {
  it("shows SeverityBadge counts when sev_* fields are present", () => {
    renderRuns([run({
      status: "done",
      findings_count: 6,
      blockers: 2,
      score: 30,
      sev_critical: 2,
      sev_warning: 3,
      sev_suggestion: 1,
    })]);
    const badges = screen.getAllByText(/^[0-9]+$/, { selector: ".tnum" });
    const counts = badges.map((el) => el.textContent);
    expect(counts).toContain("2");
    expect(counts).toContain("3");
    expect(counts).toContain("1");
    expect(screen.queryByText(/finding\(s\)/)).not.toBeInTheDocument();
  });

  it("falls back to plain text when sev_* are null (pre-migration runs)", () => {
    renderRuns([run({
      status: "done",
      findings_count: 4,
      blockers: 0,
      score: 65,
      sev_critical: null,
      sev_warning: null,
      sev_suggestion: null,
    })]);
    expect(screen.getByText(/4 finding/)).toBeInTheDocument();
  });

  it("hides zero-count severities (only shows non-zero)", () => {
    renderRuns([run({
      status: "done",
      findings_count: 2,
      blockers: 0,
      score: null,
      sev_critical: 0,
      sev_warning: 2,
      sev_suggestion: 0,
    })]);
    const badges = screen.getAllByText(/^[0-9]+$/, { selector: ".tnum" });
    expect(badges).toHaveLength(1);
    expect(badges[0]!.textContent).toBe("2");
  });
});

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});
