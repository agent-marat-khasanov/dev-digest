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
  current: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95, traces_passed: 17, traces_total: 20, cost_usd: 0.02 },
  delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
  trend: [],
  runs_total: 3,
  recent_runs: [],
  alert: null,
};

const runAllMutate = vi.fn();
const runOneMutate = vi.fn();
const deleteMutate = vi.fn();

const mockUseAgentEvals = vi.fn();
const mockUseAgentEvalDashboard = vi.fn();
const mockUseAgentEvalRunsEstimate = vi.fn();
const mockUseRunAgentEvals = vi.fn();
const mockUseRunAgentEvalCase = vi.fn();
const mockUseDeleteAgentEvalCase = vi.fn();
const mockUseAgentEvalCase = vi.fn();

vi.mock("@/lib/hooks/agent-evals", () => ({
  useAgentEvals: (...args: unknown[]) => mockUseAgentEvals(...args),
  useAgentEvalDashboard: (...args: unknown[]) => mockUseAgentEvalDashboard(...args),
  useAgentEvalRunsEstimate: (...args: unknown[]) => mockUseAgentEvalRunsEstimate(...args),
  useRunAgentEvals: (...args: unknown[]) => mockUseRunAgentEvals(...args),
  useRunAgentEvalCase: (...args: unknown[]) => mockUseRunAgentEvalCase(...args),
  useDeleteAgentEvalCase: (...args: unknown[]) => mockUseDeleteAgentEvalCase(...args),
  useAgentEvalCase: (...args: unknown[]) => mockUseAgentEvalCase(...args),
}));

// CaseEditor pulls its own real data hooks (useAgent, useAgentEvalRuns, the
// create/update mutations) — stub it here so this container test isolates
// EvalsTab's own branching, per the established pattern (client/INSIGHTS.md:
// mock leaf child modules).
vi.mock("./_components/CaseEditor", () => ({
  CaseEditor: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="case-editor-stub">
      <button onClick={onClose}>close-case-editor</button>
    </div>
  ),
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
  mockUseDeleteAgentEvalCase.mockReturnValue({ mutate: deleteMutate, isPending: false, variables: undefined });
  mockUseAgentEvalCase.mockReturnValue({ data: undefined });
});

afterEach(() => {
  cleanup();
  runAllMutate.mockReset();
  runOneMutate.mockReset();
  deleteMutate.mockReset();
});

describe("EvalsTab", () => {
  it("shows the four eval metric cards and lists cases with status, expected/got counts, and severity·category badge (or empty [])", () => {
    renderWithIntl();

    // MetricCard splits "82" and "%" into separate text nodes — match the
    // wrapping span's full textContent instead (client/INSIGHTS.md).
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "82%")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "91%")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "95%")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();
    expect(screen.getByText("View full dashboard →")).toHaveAttribute("href", "/eval/ag1");

    expect(screen.getByText("sql-injection-must-find")).toBeInTheDocument();
    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL · security")).toBeInTheDocument();

    expect(screen.getByText("clean-refactor-decoy")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getByText("empty []")).toBeInTheDocument();

    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
  });

  it("run-all shows the cost estimate, requires confirm, then runs", () => {
    renderWithIntl();
    fireEvent.click(screen.getByText("Run all evals"));

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

  it("deletes a case after confirming", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithIntl();

    fireEvent.click(screen.getAllByLabelText("Delete this case")[0]!);

    expect(window.confirm).toHaveBeenCalledWith(
      'Delete the eval case "sql-injection-must-find"? This cannot be undone.',
    );
    expect(deleteMutate).toHaveBeenCalledWith("case-1");
  });

  it("does not delete when the confirm is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithIntl();

    fireEvent.click(screen.getAllByLabelText("Delete this case")[0]!);
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("opens and closes the case editor from the New eval case button", () => {
    renderWithIntl();
    expect(screen.queryByTestId("case-editor-stub")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("New eval case"));
    expect(screen.getByTestId("case-editor-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByText("close-case-editor"));
    expect(screen.queryByTestId("case-editor-stub")).not.toBeInTheDocument();
  });

  it("opens the case editor in edit mode when a case's Edit button is clicked", () => {
    mockUseAgentEvalCase.mockReturnValue({ data: undefined });
    renderWithIntl();
    expect(screen.queryByTestId("case-editor-stub")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText("Edit this case")[0]!);
    expect(mockUseAgentEvalCase).toHaveBeenCalledWith("ag1", "case-1");

    cleanup();
    mockUseAgentEvalCase.mockReturnValue({ data: CASES[0] });
    renderWithIntl();
    fireEvent.click(screen.getAllByLabelText("Edit this case")[0]!);
    expect(screen.getByTestId("case-editor-stub")).toBeInTheDocument();
  });
});
