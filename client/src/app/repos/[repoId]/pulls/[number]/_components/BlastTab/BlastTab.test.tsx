import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import type { BlastRadius } from "@devdigest/shared";

/**
 * BlastTab behaviour: it renders the impact tree (symbol → callers → endpoints)
 * and, when a caller is clicked, opens the in-app viewer scrolled to that file.
 * The empty case shows a "no impact" state instead of a blank panel. Data hooks
 * are mocked at the boundary.
 */

const state = vi.hoisted(() => ({
  blast: undefined as unknown,
  file: undefined as unknown,
}));

vi.mock("@/lib/hooks/blast", () => ({ useBlast: () => state.blast }));
vi.mock("@/lib/hooks/repo-file", () => ({ useRepoFile: () => state.file }));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: () => ({ data: { status: "full" } }),
}));

import { BlastTab } from "./BlastTab";

beforeAll(() => {
  // jsdom has no scrollIntoView; the viewer calls it on open.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const BLAST: BlastRadius = {
  changed_symbols: [{ name: "rateLimit", file: "src/rate-limit.ts", kind: "function" }],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [{ name: "listItems", file: "src/api/items.ts", line: 23 }],
      endpoints_affected: ["GET /api/items"],
      crons_affected: [],
    },
  ],
  summary: "1 changed symbol(s), 1 caller(s).",
};

describe("BlastTab", () => {
  it("renders the impact tree and opens a caller in the in-app viewer", async () => {
    state.blast = { data: BLAST, isLoading: false, isError: false };
    state.file = {
      data: { path: "src/api/items.ts", content: "a\nb\nc" },
      isLoading: false,
      isError: false,
    };

    render(<BlastTab prId="pr1" repoId="repo1" />);

    // The tree shows the changed symbol, its endpoint, and the caller link.
    expect(screen.getByText(/rateLimit/)).toBeInTheDocument();
    expect(screen.getByText("GET /api/items")).toBeInTheDocument();
    const callerLink = screen.getByRole("button", { name: /items\.ts:23/ });

    // Clicking the caller opens the file viewer at that location.
    fireEvent.click(callerLink);
    const dialog = await screen.findByRole("dialog", { name: /items\.ts:23/ });
    expect(within(dialog).getByText(/items\.ts/)).toBeInTheDocument();
  });

  it("shows a no-impact state when nothing is indexed for the changed files", () => {
    state.blast = {
      data: { changed_symbols: [], downstream: [], summary: "No indexed symbols." },
      isLoading: false,
      isError: false,
    };

    render(<BlastTab prId="pr1" repoId="repo1" />);
    expect(screen.getByText(/no impact found/i)).toBeInTheDocument();
  });
});
