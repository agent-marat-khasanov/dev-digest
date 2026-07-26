import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import agentsMessages from "@messages/en/agents.json";
import { ApiError } from "@/lib/api";

vi.mock("@/components/diff-viewer", () => ({
  DiffViewer: ({ files }: { files: PrFile[] }) => (
    <div data-testid="diff-preview">{files[0]?.patch ?? ""}</div>
  ),
}));

const mockMutate = vi.fn();
const mockUseCreateAgentEvalCase = vi.fn();
vi.mock("@/lib/hooks/agent-evals", () => ({
  useCreateAgentEvalCase: (...args: unknown[]) => mockUseCreateAgentEvalCase(...args),
}));

import { CaseEditor } from "./CaseEditor";

function renderWithIntl(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <CaseEditor agentId="ag1" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

const DIFF_TEXT = "--- a/src/db.ts\n+++ b/src/db.ts\n@@ -1,2 +1,3 @@\n query = req.body.q\n+// unsanitized\n";

beforeEach(() => {
  mockUseCreateAgentEvalCase.mockReturnValue({ mutate: mockMutate, isPending: false });
});

afterEach(() => {
  cleanup();
  mockMutate.mockReset();
});

describe("CaseEditor", () => {
  it("pastes a diff, previews it, picks must-find, and saves via the create mutation", () => {
    const onClose = vi.fn();
    renderWithIntl(onClose);

    fireEvent.change(screen.getByPlaceholderText("e.g. sql-injection-must-find"), {
      target: { value: "sql-injection-must-find" },
    });
    fireEvent.change(screen.getByPlaceholderText("Paste a unified diff…"), {
      target: { value: DIFF_TEXT },
    });

    expect(screen.getByTestId("diff-preview")).toHaveTextContent("unsanitized");

    fireEvent.click(screen.getByText("Save"));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [input] = mockMutate.mock.calls[0]!;
    expect(input).toMatchObject({
      owner_kind: "agent",
      owner_id: "ag1",
      name: "sql-injection-must-find",
      input_diff: DIFF_TEXT,
      expected_output: [
        expect.objectContaining({ severity: "WARNING", category: "bug", start_line: 1, end_line: 1 }),
      ],
    });
  });

  it("surfaces the server's validation error on save failure without closing the modal", () => {
    const onClose = vi.fn();
    mockMutate.mockImplementation((_input, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new ApiError("expected_output failed validation", 422));
    });
    renderWithIntl(onClose);

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
