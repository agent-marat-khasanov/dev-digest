import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import type { Brief } from "@devdigest/shared";

/**
 * PrBriefCard behaviour (SPEC-03 AC-11, AC-12, AC-18, cross-review blocker #4):
 * renders the what/why narrative, the color-coded risk_level badge, risks with
 * severity/title/explanation, and a review-focus list whose file paths open the
 * in-app viewer (never an <a href>). Endpoint refs (e.g. "GET /api/foo") are
 * shown but never clickable. Loading is never blank; a failed Regenerate leaves
 * the previous brief visible with an error surfaced. Model-authored markdown
 * (links, raw HTML) never becomes an executable link or executed HTML.
 */

const state = vi.hoisted(() => ({
  brief: undefined as unknown,
  regenerate: undefined as unknown,
  file: undefined as unknown,
}));

const notifyError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => state.brief,
  useRegenerateBrief: () => state.regenerate,
}));
vi.mock("@/lib/hooks/repo-file", () => ({ useRepoFile: () => state.file }));
vi.mock("@/lib/toast", () => ({ notify: { error: notifyError, success: vi.fn(), info: vi.fn() } }));

import { PrBriefCard } from "./PrBriefCard";

beforeAll(() => {
  // jsdom has no scrollIntoView; not directly used here but other viewer paths
  // in this tree rely on it, and the modal shares the FileViewer component.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

function mockRegenerate(overrides: Partial<{ mutate: (v?: unknown, opts?: unknown) => void; isPending: boolean }> = {}) {
  state.regenerate = { mutate: vi.fn(), isPending: false, ...overrides };
}

const BASE_BRIEF: Brief = {
  pr_id: "pr1",
  what: "Adds a token-bucket rate limiter to public endpoints.",
  why: "Prevents abuse reported in the linked issue.",
  risk_level: "high",
  risks: [
    {
      kind: "network",
      title: "Burst rejection",
      explanation: "Legitimate bursts may be throttled.",
      severity: "medium",
      file_refs: ["src/middleware/ratelimit.ts", "GET /api/items"],
    },
  ],
  review_focus: [{ path: "src/middleware/ratelimit.ts", reason: "Core throttling logic lives here." }],
  generated_at: "2026-07-13T00:00:00.000Z",
  generated: { model: "gpt-4.1", cost_usd: 0.02, tokens_in: 100, tokens_out: 50 },
};

describe("PrBriefCard", () => {
  it("shows a loading skeleton, not a blank card, while the brief is generating", () => {
    state.brief = { data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn() };
    mockRegenerate();

    render(<PrBriefCard prId="pr1" repoId="repo1" />);

    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("Brief unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText(BASE_BRIEF.what)).not.toBeInTheDocument();
  });

  it("renders narrative, risk badge, risks, and a review-focus list that opens the in-app viewer (AC-11/AC-12)", async () => {
    state.brief = { data: BASE_BRIEF, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
    mockRegenerate();
    state.file = { data: { path: "src/middleware/ratelimit.ts", content: "a\nb" }, isLoading: false, isError: false };

    render(<PrBriefCard prId="pr1" repoId="repo1" />);

    expect(screen.getByText(BASE_BRIEF.what)).toBeInTheDocument();
    expect(screen.getByText(BASE_BRIEF.why)).toBeInTheDocument();

    // risk_level badge (distinct from the per-risk severity badge, which reads "medium")
    expect(screen.getByText("high risk")).toBeInTheDocument();
    expect(screen.getByText("Burst rejection")).toBeInTheDocument();
    expect(screen.getByText("Legitimate bursts may be throttled.")).toBeInTheDocument();

    // review_focus entries render as buttons (no href) and clicking opens the viewer.
    // Scoped under the "Review focus" section since the same path also appears
    // as a risk file_ref elsewhere on the card.
    const focusSection = screen.getByText("Review focus").parentElement as HTMLElement;
    const focusLink = within(focusSection).getByRole("button", {
      name: "src/middleware/ratelimit.ts",
    });
    expect(focusLink.closest("a")).toBeNull();

    fireEvent.click(focusLink);
    const dialog = await screen.findByRole("dialog", { name: "src/middleware/ratelimit.ts" });
    expect(within(dialog).getByText("src/middleware/ratelimit.ts")).toBeInTheDocument();
  });

  it("shows a file path ref as a clickable link but an endpoint ref only as plain text (blocker #4)", () => {
    state.brief = { data: BASE_BRIEF, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
    mockRegenerate();
    state.file = { data: undefined, isLoading: false, isError: false };

    render(<PrBriefCard prId="pr1" repoId="repo1" />);

    // File path ref: a clickable button, no href anywhere.
    // (getAllByRole because the same path also appears in review_focus.)
    const fileRefs = screen.getAllByRole("button", { name: "src/middleware/ratelimit.ts" });
    expect(fileRefs.length).toBeGreaterThan(0);
    for (const fileRef of fileRefs) {
      expect(fileRef.tagName).toBe("BUTTON");
      expect(fileRef.closest("a")).toBeNull();
    }

    // Endpoint ref: visible text, but neither a link nor a button.
    expect(screen.getByText("GET /api/items")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GET /api/items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GET /api/items" })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="GET /api/items"]')).toBeNull();
  });

  it("keeps the previous brief visible and surfaces an error when Regenerate fails (AC-17)", () => {
    state.brief = { data: BASE_BRIEF, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
    const mutate = vi.fn((_v, opts) => opts.onError(new Error("boom")));
    mockRegenerate({ mutate });

    render(<PrBriefCard prId="pr1" repoId="repo1" />);

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));

    // Failure surfaced via the toast bridge, and the old brief is still rendered.
    expect(notifyError).toHaveBeenCalledWith("boom");
    expect(screen.getByText(BASE_BRIEF.what)).toBeInTheDocument();
    expect(screen.getByText(BASE_BRIEF.why)).toBeInTheDocument();
  });

  it("shows an EmptyState with a Retry action, never a raw error, when no brief is available (AC-12)", () => {
    state.brief = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: vi.fn() };
    mockRegenerate();

    render(<PrBriefCard prId="pr1" repoId="repo1" />);

    expect(screen.getByText("Brief unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/error:/i)).not.toBeInTheDocument();
  });

  it("neutralizes malicious markdown/HTML in model output: no clickable javascript: link, no executed HTML (AC-18)", () => {
    const malicious: Brief = {
      ...BASE_BRIEF,
      what: "See [x](javascript:alert(1)) for details. <img src=x onerror=alert(1)>",
      risks: [
        {
          kind: "security",
          title: "Injected link risk",
          explanation: "[click me](javascript:alert(1))",
          severity: "high",
          file_refs: [],
        },
      ],
      review_focus: [
        { path: "src/middleware/ratelimit.ts", reason: "<script>alert(1)</script> plain reason text" },
      ],
    };
    state.brief = { data: malicious, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
    mockRegenerate();
    state.file = { data: undefined, isLoading: false, isError: false };

    render(<PrBriefCard prId="pr1" repoId="repo1" />);

    // No anchor tag ever carries a javascript: href, and no <a href> exists at all
    // other than what the app itself renders (there is none here).
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(document.querySelectorAll("a").length).toBe(0);

    // The link text still renders, but as inert text (span), not a clickable link.
    expect(screen.getByText("x", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("click me")).toBeInTheDocument();

    // Raw HTML from the model is not executed: no <img>/<script> element mounted,
    // and the tags show up as inert literal text instead.
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();

    // review_focus reason is rendered as plain text (not markdown), so a raw
    // <script> tag in it never becomes a DOM element either.
    expect(
      screen.getByText((_, el) => el?.textContent === "<script>alert(1)</script> plain reason text"),
    ).toBeInTheDocument();
  });
});
