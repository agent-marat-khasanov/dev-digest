import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { TourSection } from "@devdigest/shared";
import { SectionCard } from "./SectionCard";

describe("SectionCard", () => {
  it("neutralizes model-emitted links and raw HTML in the narrative body; only validated links[] render Open controls (AC-21, AC-7)", () => {
    const section: TourSection = {
      id: "architecture",
      title: "Architecture overview",
      body: [
        "Requests start at the router.",
        "",
        "[click me](javascript:alert(1))",
        "",
        "[go here](https://evil.example.com)",
        "",
        '<img src="x" onerror="alert(1)">',
      ].join("\n"),
      links: [{ label: "Router", path: "server/router.ts" }],
    };

    render(<SectionCard section={section} onOpenFile={vi.fn()} />);

    // No model-emitted string reaches the DOM as a clickable link.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.querySelector("a[href]")).toBeNull();
    // Raw HTML in the body is not executed / rendered as an element.
    expect(document.querySelector("img")).toBeNull();
    // But the link text itself still renders as inert text (not silently dropped).
    expect(screen.getByText("click me")).toBeInTheDocument();
    expect(screen.getByText("go here")).toBeInTheDocument();

    // Only the validated links[] entry becomes a clickable Open control.
    const openControl = screen.getByRole("button", { name: /server\/router\.ts/i });
    expect(openControl).toBeInTheDocument();
  });

  it("calls onOpenFile with the validated path when a link's Open control is used", () => {
    const section: TourSection = {
      id: "critical_paths",
      title: "Critical paths",
      body: "Key files.",
      links: [{ label: "Router", path: "server/router.ts" }],
    };
    const onOpenFile = vi.fn();
    render(<SectionCard section={section} onOpenFile={onOpenFile} />);

    fireEvent.click(screen.getByRole("button", { name: /server\/router\.ts/i }));
    expect(onOpenFile).toHaveBeenCalledWith("server/router.ts");
  });

  it("renders run_locally commands as an ordered list with per-command copy controls (AC-17)", () => {
    const section: TourSection = {
      id: "run_locally",
      title: "How to run locally",
      body: "Run these to get started.",
      commands: ["pnpm install", "pnpm dev"],
    };
    render(<SectionCard section={section} onOpenFile={vi.fn()} />);

    const list = screen.getByText("pnpm install").closest("ol");
    expect(list).toBeInTheDocument();
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /copy command/i })).toHaveLength(2);
  });

  it("renders reading_path as a numbered list where each entry carries its why-read-this one-liner (AC-17)", () => {
    const section: TourSection = {
      id: "reading_path",
      title: "Guided reading path",
      body: "1. `server/index.ts` — where every request starts.\n2. `server/router.ts` — routes requests to modules.",
    };
    render(<SectionCard section={section} onOpenFile={vi.fn()} />);

    const firstEntry = screen.getByText(/where every request starts/i);
    expect(firstEntry.closest("li")).toBeInTheDocument();
    expect(firstEntry.closest("ol")).toBeInTheDocument();
    expect(screen.getByText(/routes requests to modules/i)).toBeInTheDocument();
  });
});
