import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { filterSkills } from "./helpers";

const make = (name: string, description: string): Skill => ({
  id: name,
  name,
  description,
  type: "custom",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
  evidence_files: null,
});

describe("filterSkills", () => {
  const list: Skill[] = [
    make("secret-leakage-gate", "Block hardcoded secrets"),
    make("no-then-chains", "Project convention on async/await"),
    make("pr-quality-rubric", "Score the PR on four axes"),
  ];

  it("returns the full list when the query is empty/whitespace", () => {
    expect(filterSkills(list, "")).toHaveLength(3);
    expect(filterSkills(list, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively against the name", () => {
    expect(filterSkills(list, "Secret").map((s) => s.name)).toEqual(["secret-leakage-gate"]);
    expect(filterSkills(list, "THEN").map((s) => s.name)).toEqual(["no-then-chains"]);
  });

  it("matches against the description", () => {
    expect(filterSkills(list, "axes").map((s) => s.name)).toEqual(["pr-quality-rubric"]);
    expect(filterSkills(list, "async").map((s) => s.name)).toEqual(["no-then-chains"]);
  });

  it("returns [] when nothing matches", () => {
    expect(filterSkills(list, "nope")).toEqual([]);
  });
});
