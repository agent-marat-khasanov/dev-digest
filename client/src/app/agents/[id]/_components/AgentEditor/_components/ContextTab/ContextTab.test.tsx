import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentContextLink, ContextDoc } from "@devdigest/shared";
import agentsMessages from "@messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const DOCS: ContextDoc[] = [
  { path: "specs/a.md", folder_type: "specs", size_bytes: 100, tokens: 50, updated_at: null },
  { path: "docs/b.md", folder_type: "docs", size_bytes: 200, tokens: 100, updated_at: null },
];

const REMOTE_LINKS: AgentContextLink[] = [
  { agent_id: "ag1", path: "specs/a.md", order: 0 },
  { agent_id: "ag1", path: "specs/missing.md", order: 1 },
];

const setContextMutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1", activeRepo: null, repos: [], reposLoaded: true, setRepoId: vi.fn() }),
}));

vi.mock("@/lib/hooks/context", () => ({
  useAgentContext: () => ({ data: REMOTE_LINKS }),
  useContextFiles: () => ({ data: DOCS }),
  useSetAgentContext: () => ({
    mutate: setContextMutate,
    isPending: false,
    isSuccess: false,
  }),
  useContextPreview: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  setContextMutate.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ContextTab", () => {
  it("shows the N of M attached header and the total token count", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByText("2 of 2 attached")).toBeInTheDocument();
    // 50 (a.md) + 0 (missing doc contributes nothing) = 50
    expect(screen.getByText("≈ 50 tokens")).toBeInTheDocument();
  });

  it("shows per-doc token counts for resolved docs", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByText("50 tok")).toBeInTheDocument();
  });

  it("renders a missing attached doc as a muted row with a missing badge, not an error", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByText("missing.md")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });

  it("filtering hides non-matching rows without losing attached/order state", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    const filterInput = screen.getByPlaceholderText("Filter documents…");

    fireEvent.change(filterInput, { target: { value: "b.md" } });
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();
    // Header still reflects the full attached/discovered counts, unaffected by the filter.
    expect(screen.getByText("2 of 2 attached")).toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: "" } });
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("missing.md")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 attached")).toBeInTheDocument();
  });

  it("toggling a doc's checkbox updates the attached count and enables Save", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    const saveBtn = screen.getByText("Save context").closest("button") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    fireEvent.click(screen.getAllByRole("checkbox").find((cb) => cb.getAttribute("aria-checked") === "false")!);
    expect(screen.getByText("3 of 2 attached")).toBeInTheDocument();
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);
    expect(setContextMutate).toHaveBeenCalledTimes(1);
    const payload = setContextMutate.mock.calls[0]![0];
    expect(payload.docs).toEqual([
      { path: "specs/a.md", order: 0 },
      { path: "specs/missing.md", order: 1 },
      { path: "docs/b.md", order: 2 },
    ]);
  });
});
