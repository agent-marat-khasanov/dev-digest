import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { PrFile, SmartDiffResponse } from "@devdigest/shared";

// Mock the data hooks (the boundary) ...
vi.mock("@/lib/hooks/smart-diff", () => ({ useSmartDiff: vi.fn() }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => ({ data: [] }),
}));
// ... and the two leaf viewers. DiffTab's job is choosing WHICH viewer and the
// loading/error/empty states around it; the viewers (which pull in next-intl +
// the whole diff/comment subtree) are tested separately. Stubbing them keeps
// this test focused on DiffTab's branching + toggle.
vi.mock("@/components/smart-diff-viewer", () => ({
  SmartDiffViewer: () => <div data-testid="smart-diff-viewer" />,
}));
vi.mock("@/components/diff-viewer", () => ({
  DiffViewer: () => <div data-testid="diff-viewer" />,
}));

import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { DiffTab } from "./DiffTab";

afterEach(cleanup);

type SmartResult = ReturnType<typeof useSmartDiff>;
function mockSmart(value: Partial<SmartResult>) {
  vi.mocked(useSmartDiff).mockReturnValue(value as unknown as SmartResult);
}

const FILES: PrFile[] = [{ path: "src/service.ts", additions: 3, deletions: 1, patch: "@@ -1 +1 @@" }];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/service.ts", additions: 3, deletions: 1, finding_lines: [], pseudocode_summary: null },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

function renderDiffTab() {
  return render(<DiffTab prId="pr1" filesCount={1} files={FILES} canComment />);
}

describe("DiffTab", () => {
  it("shows smart-diff loading skeletons while the smart diff is being fetched", () => {
    mockSmart({ data: undefined, isLoading: true, isError: false });
    renderDiffTab();

    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("smart-diff-viewer")).not.toBeInTheDocument();
    expect(screen.queryByText("Smart Diff unavailable")).not.toBeInTheDocument();
  });

  it("shows the error empty state when the smart diff request fails", () => {
    mockSmart({ data: undefined, isLoading: false, isError: true });
    renderDiffTab();

    expect(screen.getByText("Smart Diff unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-diff-viewer")).not.toBeInTheDocument();
  });

  it("shows the 'no smart diff yet' fallback when the request resolves empty", () => {
    mockSmart({ data: undefined, isLoading: false, isError: false });
    renderDiffTab();

    expect(screen.getByText("No smart diff yet")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-diff-viewer")).not.toBeInTheDocument();
  });

  it("renders the SmartDiffViewer when data is present and toggles to the original diff", () => {
    mockSmart({ data: SMART_DIFF, isLoading: false, isError: false });
    renderDiffTab();

    // Smart mode is the default.
    expect(screen.getByTestId("smart-diff-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-viewer")).not.toBeInTheDocument();

    // Toggling to Original swaps the viewers.
    fireEvent.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByTestId("diff-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-diff-viewer")).not.toBeInTheDocument();

    // ...and back to Smart.
    fireEvent.click(screen.getByRole("button", { name: "Smart" }));
    expect(screen.getByTestId("smart-diff-viewer")).toBeInTheDocument();
  });
});
