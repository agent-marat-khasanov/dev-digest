import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skillsMessages from "@messages/en/skills.json";
import { BodyEditor } from "./BodyEditor";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("BodyEditor", () => {
  it("renders the synthetic filename and the saved token count", () => {
    renderWithIntl(
      <BodyEditor
        filename="my-skill.md"
        value="# Title"
        savedValue="# Title"
        savedTokens={42}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("my-skill.md")).toBeInTheDocument();
    expect(screen.getByText("42 tokens")).toBeInTheDocument();
    // Clean state — no unsaved chip yet.
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("shows the unsaved chip when the live value differs from saved", () => {
    renderWithIntl(
      <BodyEditor
        filename="my-skill.md"
        value="# Title edited"
        savedValue="# Title"
        savedTokens={42}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("omits the token suffix entirely when savedTokens is not provided", () => {
    renderWithIntl(
      <BodyEditor filename="x.md" value="" savedValue="" onChange={() => {}} />,
    );
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });
});
