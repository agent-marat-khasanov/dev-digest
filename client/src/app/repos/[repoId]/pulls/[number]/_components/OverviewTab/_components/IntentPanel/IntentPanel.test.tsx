import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PrIntentRecord } from "@devdigest/shared";

vi.mock("@/lib/hooks/intent", () => ({ useIntent: vi.fn() }));

import { useIntent } from "@/lib/hooks/intent";
import { IntentPanel } from "./IntentPanel";

afterEach(cleanup);

type IntentResult = ReturnType<typeof useIntent>;

function mockIntent(value: Partial<IntentResult>) {
  vi.mocked(useIntent).mockReturnValue(value as unknown as IntentResult);
}

const INTENT: PrIntentRecord = {
  pr_id: "pr1",
  intent: "Add a token-bucket rate limiter to public endpoints.",
  in_scope: ["Introduce ratelimit middleware", "Wire it into the public router"],
  out_of_scope: ["Authentication changes"],
  risks: [
    {
      kind: "network",
      title: "Burst rejection",
      explanation: "Legitimate bursts may be throttled.",
      severity: "high",
      file_refs: ["src/middleware/ratelimit.ts"],
    },
  ],
};

describe("IntentPanel", () => {
  it("shows loading skeletons while the intent is being fetched", () => {
    mockIntent({ data: undefined, isLoading: true, isError: false });
    render(<IntentPanel prId="pr1" />);

    // Skeleton bars render; no content or error state yet.
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText(INTENT.intent)).not.toBeInTheDocument();
    expect(screen.queryByText("Intent unavailable")).not.toBeInTheDocument();
  });

  it("shows the empty state when the request errors", () => {
    mockIntent({ data: undefined, isLoading: false, isError: true });
    render(<IntentPanel prId="pr1" />);

    expect(screen.getByText("Intent unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("Could not load intent analysis for this PR."),
    ).toBeInTheDocument();
  });

  it("renders the intent, scope lists, and risk chips when populated", () => {
    mockIntent({ data: INTENT, isLoading: false, isError: false });
    render(<IntentPanel prId="pr1" />);

    expect(screen.getByText(INTENT.intent)).toBeInTheDocument();

    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Introduce ratelimit middleware")).toBeInTheDocument();
    expect(screen.getByText("Wire it into the public router")).toBeInTheDocument();

    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();

    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Burst rejection")).toBeInTheDocument();
  });

  it("omits the scope and risk sections when those lists are empty", () => {
    mockIntent({
      data: { ...INTENT, in_scope: [], out_of_scope: [], risks: [] },
      isLoading: false,
      isError: false,
    });
    render(<IntentPanel prId="pr1" />);

    expect(screen.getByText(INTENT.intent)).toBeInTheDocument();
    expect(screen.queryByText("In scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
  });
});
