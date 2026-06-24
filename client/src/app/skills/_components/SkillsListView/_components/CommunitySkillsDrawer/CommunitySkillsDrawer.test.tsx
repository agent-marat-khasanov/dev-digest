import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CommunitySkill } from "@devdigest/shared";
import skillsMessages from "@messages/en/skills.json";

const FIXTURE: CommunitySkill[] = [
  {
    name: "owasp-top-10-review",
    repo: "secdev/agent-skills",
    stars: 1240,
    lang: "any",
    desc: "Maps diff changes to the OWASP Top 10.",
    type: "security",
    body: "# OWASP",
  },
  {
    name: "react-hooks-rules",
    repo: "frontend-guild/skills",
    stars: 842,
    lang: "TypeScript",
    desc: "Detects conditional hooks.",
    type: "convention",
    body: "# Hooks",
  },
];

const createMutateAsync = vi.fn(async () => ({ id: "newly-created-id" }));
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useCommunitySkills: () => ({
    data: FIXTURE,
    isLoading: false,
    isError: false,
  }),
  useCreateSkill: () => ({
    mutateAsync: createMutateAsync,
    isPending: false,
  }),
}));

import { CommunitySkillsDrawer } from "./CommunitySkillsDrawer";

afterEach(() => {
  cleanup();
  createMutateAsync.mockClear();
  pushMock.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CommunitySkillsDrawer", () => {
  it("renders the title + every fixture entry", () => {
    renderWithIntl(<CommunitySkillsDrawer onClose={() => {}} />);
    expect(screen.getByText("Search community skills")).toBeInTheDocument();
    expect(screen.getByText("owasp-top-10-review")).toBeInTheDocument();
    expect(screen.getByText("react-hooks-rules")).toBeInTheDocument();
    expect(screen.getByText("secdev/agent-skills")).toBeInTheDocument();
    // "TypeScript" appears twice — once as a filter chip and once as the lang
    // chip on the react-hooks card — both are real, the assertion only needs
    // that the lang made it into the rendered list at all.
    expect(screen.getAllByText("TypeScript").length).toBeGreaterThanOrEqual(2);
  });

  it("Import dispatches a create call with the fixture payload + community source", async () => {
    const onClose = vi.fn();
    renderWithIntl(<CommunitySkillsDrawer onClose={onClose} />);
    const [firstImport] = screen.getAllByText("Import");
    fireEvent.click(firstImport!);
    // Wait one tick for the async mutateAsync to flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync).toHaveBeenCalledWith({
      name: "owasp-top-10-review",
      description: "Maps diff changes to the OWASP Top 10.",
      type: "security",
      body: "# OWASP",
      source: "community",
    });
  });
});
