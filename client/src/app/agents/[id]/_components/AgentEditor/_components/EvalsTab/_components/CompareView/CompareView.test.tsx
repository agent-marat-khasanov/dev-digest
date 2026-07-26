import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import agentsMessages from "@messages/en/agents.json";

// Two run-all batches, each with two per-case rows, so the compare panel must
// show DELTAS BETWEEN THE AGGREGATED BATCHES (mean recall/precision/citation,
// summed cost), not a per-case comparison (AC-27).
const RUNS: EvalRunRecord[] = [
  {
    id: "run-1a",
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
    batch_id: "batch-1",
  },
  {
    id: "run-1b",
    case_id: "case-2",
    case_name: "clean-diff",
    ran_at: "2026-07-01T00:00:01.000Z",
    actual_output: [],
    pass: false,
    recall: 0.8,
    precision: 0.6,
    citation_accuracy: 0.7,
    duration_ms: 1300,
    cost_usd: 0.02,
    agent_version: 1,
    batch_id: "batch-1",
  },
  {
    id: "run-2a",
    case_id: "case-1",
    case_name: "sql-injection-must-find",
    ran_at: "2026-07-02T00:00:00.000Z",
    actual_output: [],
    pass: true,
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 0.6,
    duration_ms: 1400,
    cost_usd: 0.02,
    agent_version: 2,
    batch_id: "batch-2",
  },
  {
    id: "run-2b",
    case_id: "case-2",
    case_name: "clean-diff",
    ran_at: "2026-07-02T00:00:01.000Z",
    actual_output: [],
    pass: true,
    recall: 0.3,
    precision: 0.3,
    citation_accuracy: 0.4,
    duration_ms: 1500,
    cost_usd: 0.03,
    agent_version: 2,
    batch_id: "batch-2",
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
  it("lists batches (not per-case rows) and selecting two shows aggregated deltas and the system-prompt diff", () => {
    renderWithIntl();

    // Two run-all batches, not the four underlying per-case rows (AC-27).
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    expect(screen.getByTestId("compare-panel")).toBeInTheDocument();
    // batch-1 avg: recall 0.9, precision 0.8, citation 0.85, cost 0.03
    // batch-2 avg: recall 0.4, precision 0.4, citation 0.5, cost 0.05
    expect(screen.getByText("-0.50")).toBeInTheDocument();
    expect(screen.getByText("-0.40")).toBeInTheDocument();
    expect(screen.getByText("-0.35")).toBeInTheDocument();

    expect(
      screen.getByText((_, el) => el?.tagName === "DIV" && el.textContent === "+ Also flag XSS."),
    ).toBeInTheDocument();
  });

  it("offers only batches of this agent and requires exactly two before comparing", () => {
    renderWithIntl();
    expect(screen.queryByTestId("compare-panel")).not.toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(screen.queryByTestId("compare-panel")).not.toBeInTheDocument();
  });
});
