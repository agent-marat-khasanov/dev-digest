import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseMintPreview } from "@devdigest/shared";
import messages from "@messages/en/prReview.json";
import { MintEvalCaseModal } from "./MintEvalCaseModal";

let previewData: EvalCaseMintPreview | undefined;
let previewError: Error | undefined;
const mintMutate = vi.fn();
const runCaseMutate = vi.fn();

vi.mock("@/lib/hooks/agent-evals", () => ({
  useMintEvalCasePreview: () => ({
    data: previewData,
    isLoading: !previewData && !previewError,
    isError: !!previewError,
    error: previewError,
  }),
  useMintEvalCaseFromFinding: () => ({ mutate: mintMutate, isPending: false }),
  useRunAgentEvalCase: () => ({ mutate: runCaseMutate, isPending: false }),
}));

const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  previewData = undefined;
  previewError = undefined;
  mintMutate.mockClear();
  runCaseMutate.mockClear();
  toastSuccess.mockClear();
});

function renderModal(onClose = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <MintEvalCaseModal findingId="f1" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

const PREVIEW: EvalCaseMintPreview = {
  agent_id: "a1",
  agent_name: "Security Reviewer",
  name: "Finding: Hardcoded secret",
  input_diff: "@@ -1,2 +1,3 @@\n line one\n+  stripeKey: 'sk_live'\n line two",
  expected_output: [
    {
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded Stripe secret key",
      file: "src/config.ts",
      start_line: 11,
      end_line: 11,
    },
  ],
  decision: "accepted",
  existing_case_id: null,
};

describe("MintEvalCaseModal", () => {
  it("renders the preview and saves the case on Save", () => {
    previewData = PREVIEW;
    const onClose = vi.fn();
    renderModal(onClose);

    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText(/stripeKey/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mintMutate).toHaveBeenCalledWith("f1", expect.anything());
  });

  it("saves and runs the case on Save & Run", () => {
    previewData = PREVIEW;
    mintMutate.mockImplementation((_id, opts) => opts.onSuccess({ id: "case1" }));
    runCaseMutate.mockImplementation((_id, opts) => opts.onSuccess());
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getByRole("button", { name: "Save & Run" }));

    expect(mintMutate).toHaveBeenCalledWith("f1", expect.anything());
    expect(runCaseMutate).toHaveBeenCalledWith("case1", expect.anything());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an existing-case banner and hides the save actions", () => {
    previewData = { ...PREVIEW, existing_case_id: "existing1" };
    renderModal();

    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View case" })).toHaveAttribute(
      "href",
      "/agents/a1?tab=evals",
    );
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows the server error message when the preview fails (e.g. no owning agent)", () => {
    previewError = new Error("This finding did not come from an agent review.");
    renderModal();

    expect(screen.getByText(/did not come from an agent review/)).toBeInTheDocument();
  });
});
