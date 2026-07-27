import type { ComponentProps } from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase, EvalCaseSummary, EvalRunRecord } from "@devdigest/shared";
import agentsMessages from "@messages/en/agents.json";
import { ApiError } from "@/lib/api";

const mockUseAgent = vi.fn();
vi.mock("@/lib/hooks/agents", () => ({
  useAgent: (...args: unknown[]) => mockUseAgent(...args),
}));

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockRunMutate = vi.fn();
const mockUseCreateAgentEvalCase = vi.fn();
const mockUseUpdateAgentEvalCase = vi.fn();
const mockUseRunAgentEvalCase = vi.fn();
const mockUseAgentEvalRuns = vi.fn();
vi.mock("@/lib/hooks/agent-evals", () => ({
  useCreateAgentEvalCase: (...args: unknown[]) => mockUseCreateAgentEvalCase(...args),
  useUpdateAgentEvalCase: (...args: unknown[]) => mockUseUpdateAgentEvalCase(...args),
  useRunAgentEvalCase: (...args: unknown[]) => mockUseRunAgentEvalCase(...args),
  useAgentEvalRuns: (...args: unknown[]) => mockUseAgentEvalRuns(...args),
}));

import { CaseEditor } from "./CaseEditor";

function renderWithIntl(props: Partial<ComponentProps<typeof CaseEditor>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <CaseEditor agentId="ag1" onClose={onClose} {...props} />
    </NextIntlClientProvider>,
  );
}

const DIFF_TEXT = "--- a/src/db.ts\n+++ b/src/db.ts\n@@ -1,2 +1,3 @@\n query = req.body.q\n+// unsanitized\n";

beforeEach(() => {
  mockUseAgent.mockReturnValue({ data: { id: "ag1", name: "Security Reviewer" } });
  mockUseCreateAgentEvalCase.mockReturnValue({ mutate: mockCreateMutate, isPending: false });
  mockUseUpdateAgentEvalCase.mockReturnValue({ mutate: mockUpdateMutate, isPending: false });
  mockUseRunAgentEvalCase.mockReturnValue({ mutate: mockRunMutate, isPending: false });
  mockUseAgentEvalRuns.mockReturnValue({ data: [] });
});

afterEach(() => {
  cleanup();
  mockCreateMutate.mockReset();
  mockUpdateMutate.mockReset();
  mockRunMutate.mockReset();
});

describe("CaseEditor", () => {
  it("creates a case: fills name/diff, previews the diff, and saves the default [] expected output", () => {
    const onClose = vi.fn();
    renderWithIntl({ onClose });

    expect(screen.getByText("New eval case")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer · simulate a PR and assert the expected output")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. sql-injection-must-find"), {
      target: { value: "sql-injection-must-find" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste a unified diff…"), {
      target: { value: DIFF_TEXT },
    });

    expect(screen.getByText("valid JSON")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save"));

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    const [input] = mockCreateMutate.mock.calls[0]!;
    expect(input).toMatchObject({
      owner_kind: "agent",
      owner_id: "ag1",
      name: "sql-injection-must-find",
      input_diff: DIFF_TEXT,
      expected_output: [],
    });
  });

  it("adds a finding skeleton to the JSON editor and flags invalid JSON", () => {
    renderWithIntl();

    fireEvent.click(screen.getByText("+ Finding skeleton"));
    const jsonEditor = screen.getByDisplayValue(/"severity": "WARNING"/);
    expect(jsonEditor).toBeInTheDocument();

    fireEvent.change(jsonEditor, { target: { value: "not json" } });
    expect(screen.getByText("invalid JSON")).toBeInTheDocument();

    const saveButton = screen.getByText("Save").closest("button") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("loads an existing case in edit mode, shows the last-run status strip, and saves via update", () => {
    const onClose = vi.fn();
    const existing: EvalCase = {
      id: "case-1",
      owner_kind: "agent",
      owner_id: "ag1",
      name: "sql-injection-must-find",
      input_diff: DIFF_TEXT,
      input_files: null,
      input_meta: null,
      expected_output: [
        {
          severity: "CRITICAL",
          category: "security",
          title: "Unsanitized query",
          file: "src/db.ts",
          start_line: 2,
          end_line: 3,
        },
      ],
      notes: null,
    };
    const summary: EvalCaseSummary = {
      id: "case-1",
      name: "sql-injection-must-find",
      expected_count: 1,
      primary: { severity: "CRITICAL", category: "security" },
      last_run: { pass: true, actual_count: 1, ran_at: "2026-07-01T00:00:00.000Z" },
    };
    const runRecord: EvalRunRecord = {
      id: "run-1",
      case_id: "case-1",
      case_name: "sql-injection-must-find",
      ran_at: "2026-07-01T00:00:00.000Z",
      actual_output: [],
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1800,
      cost_usd: 0.02,
      agent_version: 3,
      batch_id: null,
    };
    mockUseAgentEvalRuns.mockReturnValue({ data: [runRecord] });

    renderWithIntl({ caseId: "case-1", initialCase: existing, summary, onClose });

    expect(screen.getByText("Eval case · sql-injection-must-find")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sql-injection-must-find")).toBeInTheDocument();
    expect(screen.getByText(/Last run passed/)).toBeInTheDocument();
    expect(screen.getByText(/expected 1 finding, got 1/)).toBeInTheDocument();
    expect(screen.getByText(/1\.8s/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.020/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save"));

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockCreateMutate).not.toHaveBeenCalled();
    const [call] = mockUpdateMutate.mock.calls[0]!;
    expect(call.caseId).toBe("case-1");
    expect(call.patch).toMatchObject({
      name: "sql-injection-must-find",
      input_diff: DIFF_TEXT,
      expected_output: [
        expect.objectContaining({ severity: "CRITICAL", category: "security", start_line: 2, end_line: 3 }),
      ],
    });
  });

  it("runs the case immediately via Run case, and via Run on save after a successful save", () => {
    const existing: EvalCase = {
      id: "case-1",
      owner_kind: "agent",
      owner_id: "ag1",
      name: "sql-injection-must-find",
      input_diff: DIFF_TEXT,
      input_files: null,
      input_meta: null,
      expected_output: [],
      notes: null,
    };
    const onClose = vi.fn();
    mockUpdateMutate.mockImplementation((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    renderWithIntl({ caseId: "case-1", initialCase: existing, onClose });

    fireEvent.click(screen.getByText("Run case"));
    expect(mockRunMutate).toHaveBeenCalledWith("case-1");

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("Save"));

    expect(mockRunMutate).toHaveBeenCalledWith("case-1");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's validation error on save failure without closing the modal", () => {
    const onClose = vi.fn();
    mockCreateMutate.mockImplementation((_input, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new ApiError("expected_output failed validation", 422));
    });
    renderWithIntl({ onClose });

    fireEvent.change(screen.getByPlaceholderText("e.g. sql-injection-must-find"), {
      target: { value: "bad-case" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste a unified diff…"), {
      target: { value: DIFF_TEXT },
    });
    fireEvent.click(screen.getByText("Save"));

    expect(screen.getByText("expected_output failed validation")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
