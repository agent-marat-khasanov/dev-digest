import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Convention } from "@devdigest/shared";
import messages from "@messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: Convention = {
  id: "c1",
  repo_id: "r1",
  category: "async-patterns",
  rule: "Always use async/await instead of .then() chains",
  evidence: { file: "src/api/users.ts", line: "42", code: "const u = await getUser(id);" },
  confidence: 0.9,
  status: "pending",
  created_at: "2026-06-22T10:00:00.000Z",
  updated_at: "2026-06-22T10:00:00.000Z",
};

function renderCard(props: Partial<React.ComponentProps<typeof ConventionCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        convention={CONVENTION}
        repoFullName="acme/app"
        branch="main"
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onSaveRule={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("shows the rule, a clickable GitHub evidence link, confidence, and fires accept/reject", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    renderCard({ onAccept, onReject });

    expect(screen.getByText("Always use async/await instead of .then() chains")).toBeInTheDocument();
    expect(screen.getByText("async-patterns")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /src\/api\/users\.ts:42/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/blob/main/src/api/users.ts#L42");

    expect(
      screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "Confidence 90%"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("saves an edited rule on Enter", () => {
    const onSaveRule = vi.fn();
    renderCard({ onSaveRule });

    fireEvent.click(screen.getByText("Always use async/await instead of .then() chains"));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Prefer async/await" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSaveRule).toHaveBeenCalledWith("Prefer async/await");
  });
});
