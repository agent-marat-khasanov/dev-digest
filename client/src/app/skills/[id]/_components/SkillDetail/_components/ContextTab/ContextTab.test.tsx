import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc, Skill, SkillContextLink } from "@devdigest/shared";
import skillsMessages from "@messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  evidence_files: null,
};

const DOCS: ContextDoc[] = [
  { path: "specs/security-baseline.md", folder_type: "specs", size_bytes: 100, tokens: 200 },
  { path: "docs/public-api.md", folder_type: "docs", size_bytes: 50, tokens: 117 },
];

const REMOTE_LINKS: SkillContextLink[] = [
  { skill_id: "sk1", path: "specs/security-baseline.md", order: 0 },
  { skill_id: "sk1", path: "specs/deleted-spec.md", order: 1 },
];

const setSkillContextMutate = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

vi.mock("@/lib/hooks/context", () => ({
  useContextFiles: () => ({ data: DOCS }),
  useSkillContext: () => ({ data: REMOTE_LINKS }),
  useSetSkillContext: () => ({
    mutate: setSkillContextMutate,
    isPending: false,
    isSuccess: false,
  }),
  useContextPreview: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  setSkillContextMutate.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ContextTab", () => {
  it("renders discovered doc rows and the inherits helper text", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(
      screen.getByText("Any agent using this skill inherits these documents."),
    ).toBeInTheDocument();
    expect(screen.getByText("security-baseline.md")).toBeInTheDocument();
    expect(screen.getByText("public-api.md")).toBeInTheDocument();
  });

  it("shows the N attached count", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    // 2 attached: security-baseline.md (resolved) + deleted-spec.md (missing).
    expect(screen.getByText("2 attached")).toBeInTheDocument();
  });

  it("renders an attached path that no longer resolves as a missing row, not an error", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    expect(screen.getByText("deleted-spec.md")).toBeInTheDocument();
    expect(screen.getByText("missing")).toBeInTheDocument();
  });

  it("filtering hides non-matching rows without losing attached state", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    const filterInput = screen.getByPlaceholderText("Filter documents…");
    fireEvent.change(filterInput, { target: { value: "public-api" } });
    expect(screen.getByText("public-api.md")).toBeInTheDocument();
    expect(screen.queryByText("security-baseline.md")).not.toBeInTheDocument();
    // Attached count is unaffected by the filter.
    expect(screen.getByText("2 attached")).toBeInTheDocument();
  });

  it("Save is disabled until the user changes the attached set", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    const saveBtn = screen.getByText("Save context").closest("button") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("toggling a checkbox enables Save and POSTs the new ordered set", () => {
    renderWithIntl(<ContextTab skill={SKILL} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // Attach the unattached public-api.md row (3rd row: security-baseline, deleted-spec, public-api).
    fireEvent.click(checkboxes[2]!);
    const saveBtn = screen.getByText("Save context").closest("button") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    fireEvent.click(saveBtn);
    expect(setSkillContextMutate).toHaveBeenCalledTimes(1);
    const payload = setSkillContextMutate.mock.calls[0]![0];
    expect(payload.docs).toEqual([
      { path: "specs/security-baseline.md", order: 0 },
      { path: "specs/deleted-spec.md", order: 1 },
      { path: "docs/public-api.md", order: 2 },
    ]);
  });
});
