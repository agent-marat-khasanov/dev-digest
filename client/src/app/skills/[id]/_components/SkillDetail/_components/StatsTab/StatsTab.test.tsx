import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import skillsMessages from "@messages/en/skills.json";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "",
  type: "rubric",
  source: "manual",
  body: "",
  enabled: true,
  version: 5,
  evidence_files: null,
};

const STATS: SkillStats = {
  used_by: 3,
  pull_frequency_pct: 71,
  accept_rate_pct: 74,
  findings_count_30d: 96,
  agents_using: [
    { id: "ag-sec", name: "Security Reviewer" },
    { id: "ag-perf", name: "Performance Reviewer" },
    { id: "ag-mentor", name: "Custom Mentor" },
  ],
  findings_by_category: [
    { category: "security", value: 52 },
    { category: "bug", value: 20 },
    { category: "perf", value: 16 },
    { category: "style", value: 12 },
  ],
};

vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: STATS, isLoading: false, isError: false }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders the four KPI cards with the stats payload", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("71")).toBeInTheDocument();
    expect(screen.getAllByText("74").length).toBeGreaterThan(0);
    expect(screen.getByText("96")).toBeInTheDocument();
  });

  it("lists agents bound to the skill with an Open link each", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Custom Mentor")).toBeInTheDocument();
    expect(screen.getAllByText("Open")).toHaveLength(3);
  });

  it("renders the donut legend entries for each finding category", () => {
    renderWithIntl(<StatsTab skill={SKILL} />);
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("perf")).toBeInTheDocument();
    expect(screen.getByText("style")).toBeInTheDocument();
  });
});
