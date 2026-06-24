import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skillsMessages from "@messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "current body",
  enabled: true,
  version: 3,
  evidence_files: null,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 3, body: "v3 body", created_at: "2026-05-30T10:00:00Z" },
  { skill_id: "sk1", version: 2, body: "v2 body", created_at: "2026-05-09T10:00:00Z" },
  { skill_id: "sk1", version: 1, body: "v1 body", created_at: "2026-03-02T10:00:00Z" },
];

const restoreMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false }),
  useSkillVersionDiff: () => ({ data: undefined, isLoading: false }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("renders one row per version with the count badge", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("marks the current version with the Current badge and hides Diff/Restore for it", () => {
    renderWithIntl(<VersionsTab skill={SKILL} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    // Older versions have both actions — 2 versions × (Diff + Restore) = 4 buttons.
    expect(screen.getAllByText("Diff")).toHaveLength(2);
    expect(screen.getAllByText("Restore")).toHaveLength(2);
  });
});
