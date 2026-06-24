import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "@messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Block diffs that introduce hardcoded secrets.",
  type: "security",
  source: "manual",
  body: "Refuse any diff that introduces a hardcoded secret.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard (smoke)", () => {
  it("renders the skill name, description and type chip", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("Block diffs that introduce hardcoded secrets.")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("invokes onToggle when the per-card toggle is clicked", () => {
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} />);
    // The Toggle has aria-pressed on its inner button; just find the role.
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
