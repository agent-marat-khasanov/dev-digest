import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "@messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
// `currentTrace` is mutable so individual tests can swap the fixture in.
let currentTrace: RunTrace;
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.0013, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};
currentTrace = TRACE;

vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: currentTrace, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  currentTrace = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("renders the COST stat with a formatted USD value", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("renders one prompt block per skill_blocks entry with name + token count", () => {
    currentTrace = {
      ...TRACE,
      prompt_assembly: {
        ...TRACE.prompt_assembly,
        skills: null,
        skill_blocks: [
          { id: "sk-1", name: "secret-leakage-gate", body: "skill 1 body", tokens: 42 },
          { id: "sk-2", name: "lethal-trifecta", body: "skill 2 body", tokens: 91 },
        ],
      },
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // Prompt assembly section is collapsed by default — expand it first.
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText(/Skill: secret-leakage-gate · 42 tok/)).toBeInTheDocument();
    expect(screen.getByText(/Skill: lethal-trifecta · 91 tok/)).toBeInTheDocument();
    // The legacy "Skills (dynamic)" single-block label must NOT appear when
    // skill_blocks is populated — the renderer prefers the per-skill view.
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });

  it("falls back to the legacy single skills block when skill_blocks is null", () => {
    // The default TRACE fixture sets skills: "### skill" and no skill_blocks.
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
  });
});
