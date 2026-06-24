import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import skillsMessages from "@messages/en/skills.json";
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

const WORKSPACE_SKILLS: Skill[] = [
  {
    id: "sk-rubric",
    name: "pr-quality-rubric",
    description: "",
    type: "rubric",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
  {
    id: "sk-secret",
    name: "secret-leakage-gate",
    description: "",
    type: "security",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
  {
    id: "sk-unbound",
    name: "phantom-api-gate",
    description: "",
    type: "security",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
];

const REMOTE_LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "sk-rubric", order: 0, enabled: true },
  { agent_id: "ag1", skill_id: "sk-secret", order: 1, enabled: false },
];

const setSkillsMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: REMOTE_LINKS }),
  useSkills: () => ({ data: WORKSPACE_SKILLS }),
  useSetAgentSkills: () => ({
    mutate: setSkillsMutate,
    isPending: false,
    isSuccess: false,
  }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setSkillsMutate.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("renders the bound skills with the enabled-of-total counter", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    // 1 of 2 enabled (sk-secret is disabled per-agent).
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });

  it("Save is disabled until the user changes the bound set", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const saveBtn = screen.getByText("Save skills").closest("button") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("toggling a checkbox enables Save and POSTs the new links payload", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    // Flip the second skill's checkbox (it starts disabled, will become enabled).
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!); // sk-secret toggle
    const saveBtn = screen.getByText("Save skills").closest("button") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();

    fireEvent.click(saveBtn);
    expect(setSkillsMutate).toHaveBeenCalledTimes(1);
    const payload = setSkillsMutate.mock.calls[0]![0];
    expect(payload.links).toEqual([
      { skill_id: "sk-rubric", enabled: true },
      { skill_id: "sk-secret", enabled: true },
    ]);
  });

  it("removing a bound skill drops it from the list and marks dirty", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const unlinkButtons = screen.getAllByLabelText("Unlink skill");
    expect(unlinkButtons).toHaveLength(2);
    fireEvent.click(unlinkButtons[0]!);
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 1 enabled")).toBeInTheDocument();
  });
});
