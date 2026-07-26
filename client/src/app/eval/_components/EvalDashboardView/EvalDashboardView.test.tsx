import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalDashboardOverview } from "@devdigest/shared";
import messages from "@messages/en/evalDashboard.json";
import { EvalDashboardView } from "./EvalDashboardView";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const runAllMutate = vi.fn();
let dashboardData: EvalDashboardOverview | undefined;
let estimateData: { agent_count: number; case_count: number; estimated_cost_usd: number } | undefined;

vi.mock("@/lib/hooks/agent-evals", () => ({
  useEvalDashboardOverview: () => ({
    data: dashboardData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useEvalRunsEstimate: () => ({
    data: estimateData,
    isLoading: false,
    isError: false,
  }),
  useRunAllAgentEvals: () => ({
    mutate: runAllMutate,
    isPending: false,
  }),
}));

afterEach(() => {
  cleanup();
  runAllMutate.mockClear();
  dashboardData = undefined;
  estimateData = undefined;
});

function renderView() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ evalDashboard: messages }}>
        <EvalDashboardView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const OVERVIEW: EvalDashboardOverview = {
  agents: [
    {
      agent_id: "a1",
      agent_name: "Security Reviewer",
      recall: 0.8,
      precision: 0.9,
      citation_accuracy: 0.75,
      last_run_pass_count: { passed: 7, total: 8 },
    },
  ],
  recent_runs: [
    {
      id: "r1",
      case_id: "c1",
      case_name: "stripe-key-leak",
      ran_at: new Date("2026-07-20T10:00:00Z").toISOString(),
      actual_output: [],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1200,
      cost_usd: 0.01,
      agent_version: 3,
      batch_id: "b1",
    },
  ],
};

describe("EvalDashboardView", () => {
  it("renders one row per agent with its latest metrics and pass count", () => {
    dashboardData = OVERVIEW;
    renderView();

    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("7/8 passed")).toBeInTheDocument();
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
  });

  it("renders a clear empty state when no agent has any runs yet", () => {
    dashboardData = {
      agents: [{ ...OVERVIEW.agents[0]!, last_run_pass_count: null }],
      recent_runs: [],
    };
    renderView();

    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByText("Security Reviewer")).not.toBeInTheDocument();
  });

  it("shows the cost estimate on Run all agents and only runs after confirm", () => {
    dashboardData = OVERVIEW;
    estimateData = { agent_count: 2, case_count: 16, estimated_cost_usd: 0.234 };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(screen.getByText(/16 eval cases across 2 agents/)).toBeInTheDocument();
    expect(runAllMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm & run" }));
    expect(runAllMutate).toHaveBeenCalledTimes(1);
  });
});
