import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Architecture guard — enforces frontend-architecture rule 6: feature code must
 * reach shared infrastructure (`lib/`, `components/`, `messages/`) through path
 * aliases (`@/…`, `@messages/…`), never via deep `../../../` traversal.
 *
 * Intra-feature co-location refs (a sub-component importing its route's own
 * `../../constants` | `styles` | `helpers`) are the intended pattern and stay.
 */
const ROOT = "src";
const SKIP = new Set(["vendor"]); // vendored code owns its own relative imports

/** any `"(../)+(lib|components|messages)/` — from / vi.mock / import() positions. */
const FORBIDDEN = /"(?:\.\.\/)+(?:lib|components|messages)\//;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return SKIP.has(entry) ? [] : walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe("frontend architecture", () => {
  it("uses path aliases, not deep relative imports, to reach shared infra", () => {
    const repoRoot = path.resolve(__dirname, "../..");
    const offenders = walk(path.join(repoRoot, ROOT))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .map((line, i) => ({ file, line: line.trim(), n: i + 1 }))
          .filter(({ line }) => FORBIDDEN.test(line))
          .map(({ file, line, n }) => `${path.relative(repoRoot, file)}:${n}  ${line}`),
      );

    expect(
      offenders,
      `Deep relative imports must use aliases (@/lib, @/components, @messages):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
