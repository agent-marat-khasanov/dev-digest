import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContextDoc } from "@devdigest/shared";
import { ContextView } from "./ContextView";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "repo-1",
    activeRepo: { id: "repo-1", name: "devdigest", full_name: "org/devdigest", default_branch: "main" },
  }),
}));

const useContextFiles = vi.fn();
const useReindexContext = vi.fn();
const useContextPreview = vi.fn();

vi.mock("@/lib/hooks/context", () => ({
  useContextFiles: (...args: unknown[]) => useContextFiles(...args),
  useReindexContext: (...args: unknown[]) => useReindexContext(...args),
  useContextPreview: (...args: unknown[]) => useContextPreview(...args),
}));

const DOCS: ContextDoc[] = [
  { path: "specs/security-baseline.md", folder_type: "specs", size_bytes: 120, tokens: 40 },
  { path: "docs/architecture.md", folder_type: "docs", size_bytes: 200, tokens: 80 },
];

beforeEach(() => {
  vi.clearAllMocks();
  useReindexContext.mockReturnValue({ mutate: vi.fn(), isPending: false });
  useContextPreview.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
});

describe("ContextView", () => {
  it("shows a loading state while docs are loading", () => {
    useContextFiles.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(<ContextView />);
    expect(screen.queryByText(/no docs found/i)).not.toBeInTheDocument();
  });

  it("shows an empty state naming the searched root folders", () => {
    useContextFiles.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<ContextView />);
    expect(screen.getByText(/no docs found/i)).toBeInTheDocument();
    expect(screen.getByText(/specs, docs, insights/i)).toBeInTheDocument();
  });

  it("shows an error state prompting a repo sync when discovery fails", () => {
    useContextFiles.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    render(<ContextView />);
    expect(screen.getByText(/isn't available/i)).toBeInTheDocument();
    expect(screen.getByText(/sync the repo/i)).toBeInTheDocument();
  });

  it("renders one row per doc with its path and folder badge", () => {
    useContextFiles.mockReturnValue({ data: DOCS, isLoading: false, isError: false, refetch: vi.fn() });
    render(<ContextView />);
    expect(screen.getByText("specs/security-baseline.md")).toBeInTheDocument();
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("renders the read-only markdown preview for the selected doc", () => {
    useContextFiles.mockReturnValue({ data: DOCS, isLoading: false, isError: false, refetch: vi.fn() });
    useContextPreview.mockReturnValue({
      data: { path: "specs/security-baseline.md", content: "# Security Baseline\n\nDo not skip auth." },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ContextView />);
    fireEvent.click(screen.getByText("security-baseline.md"));
    expect(screen.getByText("Security Baseline")).toBeInTheDocument();
    expect(screen.getByText(/Do not skip auth/)).toBeInTheDocument();
  });

  it("triggers a rescan via useReindexContext", () => {
    useContextFiles.mockReturnValue({ data: DOCS, isLoading: false, isError: false, refetch: vi.fn() });
    const mutate = vi.fn();
    useReindexContext.mockReturnValue({ mutate, isPending: false });
    render(<ContextView />);
    fireEvent.click(screen.getByRole("button", { name: /rescan/i }));
    expect(mutate).toHaveBeenCalledWith("repo-1");
  });
});
