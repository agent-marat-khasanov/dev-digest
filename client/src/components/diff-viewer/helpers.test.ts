import { describe, it, expect } from "vitest";
import { parsePatch } from "./helpers";

/**
 * parsePatch is fed `prFile?.patch` by SmartFileCard, so it must tolerate a
 * missing/undefined patch (e.g. a smart-diff file path with no matching PrFile
 * after a branch update) by returning an empty list rather than throwing.
 */
describe("parsePatch", () => {
  it("returns an empty array for undefined / null / empty input (never throws)", () => {
    expect(parsePatch(undefined)).toEqual([]);
    expect(parsePatch(null)).toEqual([]);
    expect(parsePatch("")).toEqual([]);
  });

  it("parses a unified-diff hunk into add/del/ctx lines with line numbers", () => {
    const patch = ["@@ -10,3 +10,4 @@", " port: 3000,", "+stripeKey: x", "-redisUrl: y"].join("\n");

    const lines = parsePatch(patch);

    expect(lines.map((l) => l.kind)).toEqual(["hunk", "ctx", "add", "del"]);
    // context line carries both old + new numbers from the hunk header
    expect(lines[1]).toMatchObject({ kind: "ctx", oldNo: 10, newNo: 10 });
    // the added line advances the new-side counter
    expect(lines[2]).toMatchObject({ kind: "add", text: "stripeKey: x", newNo: 11 });
    expect(lines[3]).toMatchObject({ kind: "del", text: "redisUrl: y", oldNo: 11 });
  });
});
