import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseSummary, EvalDashboard } from "@devdigest/shared";
import agentsMessages from "@messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const CASES: EvalCaseSummary[] = [
  {
    id: "case-1",
    name: "sql-injection-must-find",
    expected_count: 1,
    primary: { severity: "CRITICAL", category: "security" },
    last_run: { pass: true, actual_count: 1, ran_at: "2026-07-01T00:00:00.000Z" },
  },
  {
    id: "case-2",
    name: "clean-refactor-decoy",
    expected_count: 0,
    primary: null,
    last_run: null,
  },
];

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag1",
  cases_total: 2,
  current: { recall: 0.9, precision: 0.8, citation_accuracy: 0.75, traces_passed: 1, traces_total: 2, cost_usd: 0.02 },
  delta: { recall: 0, precision: 0, citation_accuracy: 0 },
  trend: [],
  recent_runs: [],
  alert: null,
};

const runAllMutate = vi.fn();
const runOneMutate = vi.fn();

const mockUseAgentEvals = vi.fn();
const mockUseAgentEvalDashboard = vi.fn();
const mockUseAgentEvalRunsEstimate = vi.fn();
const mockUseRunAgentEvals = vi.fn();
const mockUseRunAgentEvalCase = vi.fn();

vi.mock("@/lib/hooks/agent-evals", () => ({
  useAgentEvals: (...args: unknown[]) => mockUseAgentEvals(...args),
  useAgentEvalDashboard: (...args: unknown[]) => mockUseAgentEvalDashboard(...args),
  useAgentEvalRunsEstimate: (...args: unknown[]) => mockUseAgentEvalRunsEstimate(...args),
  useRunAgentEvals: (...args: unknown[]) => mockUseRunAgentEvals(...args),
  useRunAgentEvalCase: (...args: unknown[]) => mockUseRunAgentEvalCase(...args),
}));

import { EvalsTab } from "./EvalsTab";

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <ToastProvider>
        <EvalsTab agentId="ag1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockUseAgentEvals.mockReturnValue({ data: CASES, isLoading: false, isError: false, refetch: vi.fn() });
  mockUseAgentEvalDashboard.mockReturnValue({ data: DASHBOARD });
  mockUseAgentEvalRunsEstimate.mockReturnValue({
    data: { case_count: 2, estimated_cost_usd: 0.1234 },
    isLoading: false,
  });
  mockUseRunAgentEvals.mockReturnValue({ mutate: runAllMutate, isPending: false });
  mockUseRunAgentEvalCase.mockReturnValue({ mutate: runOneMutate, isPending: false, variables: undefined });
});

afterEach(() => {
  cleanup();
  runAllMutate.mockReset();
  runOneMutate.mockReset();
});

describe("EvalsTab", () => {
  it("lists cases with status, expected/got counts, and severity·category badge (or empty [])", () => {
    renderWithIntl();
    expect(screen.getByText("sql-injection-must-find")).toBeInTheDocument();
    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL · security")).toBeInTheDocument();

    expect(screen.getByText("clean-refactor-decoy")).toBeInTheDocument();
    expect(screen.getByText("expected 0 findings · never run")).toBeInTheDocument();
    expect(screen.getByText("empty []")).toBeInTheDocument();

    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
  });

  it("run-all shows the cost estimate, requires confirm, then runs", () => {
    renderWithIntl();
    fireEvent.click(screen.getByText("Run all"));

    expect(screen.getByText("2 cases · ≈$0.1234 — run now?")).toBeInTheDocument();
    expect(runAllMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Confirm"));
    expect(runAllMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("2 cases · ≈$0.1234 — run now?")).not.toBeInTheDocument();
  });

  it("runs a single case directly, without estimate/confirm", () => {
    renderWithIntl();
    const runButtons = screen.getAllByLabelText("Run this case");
    fireEvent.click(runButtons[0]!);

    expect(runOneMutate).toHaveBeenCalledTimes(1);
    expect(runOneMutate).toHaveBeenCalledWith("case-1");
    expect(screen.queryByText(/run now\?/)).not.toBeInTheDocument();
  });

  it("disables run-all and shows a running indicator while a run is already in progress", () => {
    mockUseRunAgentEvals.mockReturnValue({ mutate: runAllMutate, isPending: true });
    renderWithIntl();

    const runAllBtn = screen.getByText("Running…").closest("button") as HTMLButtonElement;
    expect(runAllBtn.disabled).toBe(true);
  });
});
