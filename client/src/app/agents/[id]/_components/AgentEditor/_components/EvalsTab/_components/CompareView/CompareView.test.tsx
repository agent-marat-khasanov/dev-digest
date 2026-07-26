import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import agentsMessages from "@messages/en/agents.json";

const RUNS: EvalRunRecord[] = [
  {
    id: "run-1",
    case_id: "case-1",
    case_name: "sql-injection-must-find",
    ran_at: "2026-07-01T00:00:00.000Z",
    actual_output: [],
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 1200,
    cost_usd: 0.01,
    agent_version: 1,
    batch_id: null,
  },
  {
    id: "run-2",
    case_id: "case-1",
    case_name: "sql-injection-must-find",
    ran_at: "2026-07-02T00:00:00.000Z",
    actual_output: [],
    pass: true,
    recall: 0.5,
    precision: 0.8,
    citation_accuracy: 0.9,
    duration_ms: 1400,
    cost_usd: 0.02,
    agent_version: 2,
    batch_id: null,
  },
];

const mockUseAgentEvalRuns = vi.fn();
vi.mock("@/lib/hooks/agent-evals", () => ({
  useAgentEvalRuns: (...args: unknown[]) => mockUseAgentEvalRuns(...args),
}));

const mockUseAgentVersionSnapshot = vi.fn();
vi.mock("./useAgentVersionSnapshot", () => ({
  useAgentVersionSnapshot: (...args: unknown[]) => mockUseAgentVersionSnapshot(...args),
}));

import { CompareView } from "./CompareView";

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <CompareView agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockUseAgentEvalRuns.mockReturnValue({ data: RUNS });
  mockUseAgentVersionSnapshot.mockImplementation((_agentId: string, version: number | null) => ({
    data:
      version === 1
        ? { agent_id: "ag1", version: 1, config: { system_prompt: "Be strict.\nFlag SQL injection." }, created_at: "" }
        : version === 2
          ? {
              agent_id: "ag1",
              version: 2,
              config: { system_prompt: "Be strict.\nFlag SQL injection.\nAlso flag XSS." },
              created_at: "",
            }
          : undefined,
  }));
});

afterEach(() => {
  cleanup();
  mockUseAgentVersionSnapshot.mockReset();
});

describe("CompareView", () => {
  it("selecting two runs shows per-metric deltas and the system-prompt diff", () => {
    renderWithIntl();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    expect(screen.getByTestId("compare-panel")).toBeInTheDocument();
    expect(screen.getByText("-0.50")).toBeInTheDocument();
    expect(screen.getByText("-0.20")).toBeInTheDocument();
    expect(screen.getByText("-0.10")).toBeInTheDocument();

    expect(
      screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === "+ Also flag XSS."),
    ).toBeInTheDocument();
  });

  it("offers only runs of this agent and requires exactly two before comparing", () => {
    renderWithIntl();
    expect(screen.queryByTestId("compare-panel")).not.toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(screen.queryByTestId("compare-panel")).not.toBeInTheDocument();
  });
});
