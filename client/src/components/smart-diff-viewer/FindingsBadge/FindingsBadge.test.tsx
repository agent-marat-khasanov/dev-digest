import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReviewRecord, SmartDiffFile } from "@devdigest/shared";
import { FindingsBadge } from "./FindingsBadge";

afterEach(cleanup);

const FILE: SmartDiffFile = {
  path: "src/middleware/ratelimit.ts",
  additions: 84,
  deletions: 0,
  finding_lines: [28, 52],
  pseudocode_summary: null,
};

// Minimal latest-review shape the badge reads (file / start_line / severity / id).
const REVIEWS = [
  {
    id: "rev1",
    findings: [
      { id: "f-28", file: FILE.path, start_line: 28, severity: "WARNING" },
      { id: "f-52", file: FILE.path, start_line: 52, severity: "CRITICAL" },
    ],
  },
] as unknown as ReviewRecord[];

describe("FindingsBadge", () => {
  it("deep-links to the first finding of the file when clicked", () => {
    const onOpenFinding = vi.fn();
    render(<FindingsBadge file={FILE} reviews={REVIEWS} onOpenFinding={onOpenFinding} />);

    fireEvent.click(screen.getByRole("button", { name: /2 findings/i }));
    expect(onOpenFinding).toHaveBeenCalledWith("f-28");
  });

  it("renders nothing when the file has no findings", () => {
    const onOpenFinding = vi.fn();
    render(
      <FindingsBadge
        file={{ ...FILE, finding_lines: [] }}
        reviews={REVIEWS}
        onOpenFinding={onOpenFinding}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
