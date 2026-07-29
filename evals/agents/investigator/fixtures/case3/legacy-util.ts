// Synthetic fixture module for investigator evals — NOT part of the real DevDigest codebase.
// Contains a deliberate off-by-one bug (line 8): `i <= n` reads one element past the intended range.

export function sumFirstN(items: number[], n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += items[i] ?? 0;
  }
  return total;
}
