import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import agentsMessages from "@messages/en/agents.json";

const mockUseAgentEvalRuns = vi.fn();
vi.mock("@/lib/hooks/agent-evals", () => ({
  useAgentEvalRuns: (...args: unknown[]) => mockUseAgentEvalRuns(...args),
}));

import { TrendChart } from "./TrendChart";

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <TrendChart agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

function makeRun(overrides: Partial<EvalRunRecord>): EvalRunRecord {
  return {
    id: "run-1",
    case_id: "case-1",
    case_name: "case",
    ran_at: "2026-07-01T00:00:00.000Z",
    actual_output: [],
    pass: true,
    recall: 0.9,
    precision: 0.9,
    citation_accuracy: 0.9,
    duration_ms: 1000,
    cost_usd: 0.01,
    agent_version: 1,
    batch_id: null,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("TrendChart", () => {
  beforeEach(() => mockUseAgentEvalRuns.mockReset());

  it("renders a single-point placeholder (not an empty/broken chart) when fewer than two batches exist", () => {
    // Two per-case rows sharing one batch_id — still just ONE run-all batch.
    mockUseAgentEvalRuns.mockReturnValue({
      data: [
        makeRun({ id: "run-1", case_id: "case-1", batch_id: "batch-1" }),
        makeRun({ id: "run-2", case_id: "case-2", batch_id: "batch-1" }),
      ],
    });
    renderWithIntl();

    expect(screen.getByTestId("trend-chart-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("trend-chart")).not.toBeInTheDocument();
  });

  it("renders a chart with one point per batch once there are two or more batches, even when a batch has multiple case rows", () => {
    mockUseAgentEvalRuns.mockReturnValue({
      data: [
        // batch-1: two case rows, same run-all execution → ONE point
        makeRun({ id: "run-1a", case_id: "case-1", ran_at: "2026-07-01T00:00:00.000Z", agent_version: 1, batch_id: "batch-1" }),
        makeRun({ id: "run-1b", case_id: "case-2", ran_at: "2026-07-01T00:00:01.000Z", agent_version: 1, batch_id: "batch-1" }),
        // batch-2: single-case run-all → its own point
        makeRun({ id: "run-2", case_id: "case-1", ran_at: "2026-07-02T00:00:00.000Z", agent_version: 2, batch_id: "batch-2" }),
      ],
    });
    renderWithIntl();

    expect(screen.getByTestId("trend-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("trend-chart-placeholder")).not.toBeInTheDocument();
  });
});
