import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OnboardingTour } from "@devdigest/shared";
import { TourView } from "./TourView";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "repo-1",
    activeRepo: { id: "repo-1", name: "devdigest", full_name: "org/devdigest", default_branch: "main" },
  }),
}));

const useTour = vi.fn();
const useRegenerateTour = vi.fn();
vi.mock("@/lib/hooks/onboarding", () => ({
  useTour: (...args: unknown[]) => useTour(...args),
  useRegenerateTour: (...args: unknown[]) => useRegenerateTour(...args),
}));

const useRefreshRepo = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useRefreshRepo: (...args: unknown[]) => useRefreshRepo(...args),
}));

const LOADED_TOUR: OnboardingTour = {
  repo_id: "repo-1",
  mode: "model",
  reason: null,
  sections: [
    { id: "architecture", title: "Architecture overview", body: "Requests start at `server/index.ts`." },
    { id: "critical_paths", title: "Critical paths", body: "Key files.", links: [{ label: "Router", path: "server/router.ts" }] },
    {
      id: "run_locally",
      title: "How to run locally",
      body: "Run these commands.",
      commands: ["pnpm install", "pnpm dev"],
    },
    {
      id: "reading_path",
      title: "Guided reading path",
      body: "1. `server/index.ts` — where every request starts.\n2. `server/router.ts` — routes requests to modules.",
    },
    { id: "first_tasks", title: "First tasks", body: "Fix a typo in the README." },
  ],
  index: { files_indexed: 42, sha: "abc123" },
  generated_at: "2026-07-01T00:00:00Z",
  generated: { model: "deepseek/deepseek-v4-flash", cost_usd: 0.012, tokens_in: 1000, tokens_out: 500 },
};

const SKELETON_TOUR: OnboardingTour = {
  ...LOADED_TOUR,
  mode: "skeleton",
  reason: "index_degraded",
  generated: null,
};

const NOT_AVAILABLE_TOUR: OnboardingTour = {
  repo_id: "repo-1",
  mode: "not_available",
  reason: "not_cloned",
  sections: [],
  index: { files_indexed: 0, sha: null },
  generated_at: null,
  generated: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  useRegenerateTour.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useRefreshRepo.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

describe("TourView", () => {
  it("shows a loading state (not blank) while fetching, then swaps in the tour (AC-16)", () => {
    useTour.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    const { rerender } = render(<TourView />);

    // Not a blank screen: the header still renders while generating.
    expect(screen.getByText(/onboarding for/i)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /on this page/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Architecture overview")).not.toBeInTheDocument();

    useTour.mockReturnValue({ data: LOADED_TOUR, isLoading: false, isError: false, refetch: vi.fn() });
    rerender(<TourView />);

    expect(screen.getByRole("navigation", { name: /on this page/i })).toBeInTheDocument();
    expect(screen.getAllByText("Architecture overview").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Guided reading path").length).toBeGreaterThan(0);
  });

  it("renders run_locally as an ordered list with per-command copy controls and reading_path as a numbered why list (AC-17)", () => {
    useTour.mockReturnValue({ data: LOADED_TOUR, isLoading: false, isError: false, refetch: vi.fn() });
    render(<TourView />);

    // run_locally: each command individually copyable.
    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
    const copyButtons = screen.getAllByRole("button", { name: /copy command/i });
    expect(copyButtons).toHaveLength(2);

    // reading_path: numbered list, each entry carries its "why" one-liner.
    expect(screen.getByText(/where every request starts/i)).toBeInTheDocument();
    expect(screen.getByText(/routes requests to modules/i)).toBeInTheDocument();
  });

  it("shows an honest skeleton badge naming the reason when generated without the model (AC-10)", () => {
    useTour.mockReturnValue({ data: SKELETON_TOUR, isLoading: false, isError: false, refetch: vi.fn() });
    render(<TourView />);

    expect(screen.getByText(/generated without model/i)).toBeInTheDocument();
    expect(screen.getByText(/repo index isn't fully built yet/i)).toBeInTheDocument();
    // Still shows real section content, never an empty screen.
    expect(screen.getAllByText("Architecture overview").length).toBeGreaterThan(0);
  });

  it("shows a sync-repo CTA instead of a skeleton when the repo was never cloned (AC-12)", () => {
    useTour.mockReturnValue({ data: NOT_AVAILABLE_TOUR, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn();
    useRefreshRepo.mockReturnValue({ mutate, isPending: false });
    render(<TourView />);

    expect(screen.getByText(/isn't available yet/i)).toBeInTheDocument();
    // No skeleton is attempted from metadata: no section titles, no "generated without model" badge.
    expect(screen.queryByText("Architecture overview")).not.toBeInTheDocument();
    expect(screen.queryByText(/generated without model/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sync repo/i }));
    expect(mutate).toHaveBeenCalledWith("repo-1");
  });
});
