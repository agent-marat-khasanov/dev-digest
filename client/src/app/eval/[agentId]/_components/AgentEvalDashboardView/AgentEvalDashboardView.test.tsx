import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentVersion, EvalDashboard } from "@devdigest/shared";
import messages from "@messages/en/evalDashboard.json";
import { AgentEvalDashboardView } from "./AgentEvalDashboardView";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "a1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

const AGENT: Agent = {
  id: "a1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  enabled: true,
  version: 7,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

const updateMutate = vi.fn();
const runEvalMutate = vi.fn();
let dashboardData: EvalDashboard | undefined;
let versionData: Record<number, AgentVersion>;

vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => ({ data: AGENT, isLoading: false }),
  useAgents: () => ({ data: [AGENT] }),
  useUpdateAgent: () => ({ mutate: updateMutate, isPending: false }),
}));

vi.mock("@/lib/hooks/agent-evals", () => ({
  useAgentEvalDashboard: () => ({
    data: dashboardData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAgentEvalRunsEstimate: () => ({
    data: { case_count: 20, estimated_cost_usd: 0.05 },
    isLoading: false,
    isError: false,
  }),
  useRunAgentEvals: () => ({ mutate: runEvalMutate, isPending: false }),
  useAgentVersionSnapshot: (_agentId: string, version: number | null) => ({
    data: version != null ? versionData[version] : undefined,
  }),
}));

afterEach(() => {
  cleanup();
  updateMutate.mockClear();
  runEvalMutate.mockClear();
  dashboardData = undefined;
  versionData = {};
});

function renderView() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ evalDashboard: messages }}>
        <AgentEvalDashboardView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "a1",
  cases_total: 20,
  current: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95, traces_passed: 17, traces_total: 20, cost_usd: 0.23 },
  delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
  trend: [
    { ran_at: "2026-05-01T10:00:00Z", recall: 0.78, precision: 0.93, citation_accuracy: 0.94, pass_rate: 0.8, cost_usd: 0.21 },
    { ran_at: "2026-05-29T09:14:00Z", recall: 0.82, precision: 0.91, citation_accuracy: 0.95, pass_rate: 0.85, cost_usd: 0.23 },
  ],
  runs_total: 7,
  recent_runs: [
    {
      batch_id: "b1",
      agent_id: "a1",
      agent_name: "Security Reviewer",
      ran_at: "2026-05-01T10:00:00Z",
      agent_version: 6,
      recall: 0.78,
      precision: 0.93,
      citation_accuracy: 0.94,
      passed: 16,
      total: 20,
      cost_usd: 0.21,
    },
    {
      batch_id: "b2",
      agent_id: "a1",
      agent_name: "Security Reviewer",
      ran_at: "2026-05-29T09:14:00Z",
      agent_version: 7,
      recall: 0.82,
      precision: 0.91,
      citation_accuracy: 0.95,
      passed: 17,
      total: 20,
      cost_usd: 0.23,
    },
  ],
  alert: "Precision dipped 2pts on v7 — a new false positive slipped in. Recall and citation both up.",
};

describe("AgentEvalDashboardView", () => {
  it("renders the agent header, alert banner and headline metric cards", () => {
    dashboardData = DASHBOARD;
    renderView();

    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText(/7 runs on the 20-case set/)).toBeInTheDocument();
    expect(screen.getByText(/Precision dipped 2pts/)).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("91")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("enables Compare only once exactly two runs are selected, and opens the diff modal with metric transitions", () => {
    dashboardData = DASHBOARD;
    const versionConfig = {
      provider: AGENT.provider,
      model: AGENT.model,
      system_prompt: AGENT.system_prompt,
      strategy: AGENT.strategy,
      ci_fail_on: AGENT.ci_fail_on,
      repo_intel: AGENT.repo_intel,
      skills: [],
    };
    versionData = {
      6: { agent_id: "a1", version: 6, created_at: "2026-05-01T10:00:00Z", config: { ...versionConfig, system_prompt: "Old prompt line." } },
      7: { agent_id: "a1", version: 7, created_at: "2026-05-29T09:14:00Z", config: { ...versionConfig, system_prompt: "New prompt line." } },
    };
    renderView();

    const compareButton = screen.getByRole("button", { name: "Compare" });
    expect(compareButton).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    expect(compareButton).toBeEnabled();

    fireEvent.click(compareButton);
    expect(screen.getByText("Compare runs · v6 → v7")).toBeInTheDocument();
    expect(screen.getByText("▲4pt")).toBeInTheDocument();
  });
});
