/**
 * Filesystem anchors. The eval package reads the real `.ai/skills` and `.ai/agents`
 * by relative path — these consts are the single source of those locations.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVALS_DIR = join(HERE, "..", "..");
export const REPO_ROOT = join(EVALS_DIR, "..");
export const SKILLS_DIR = join(REPO_ROOT, ".ai", "skills");
export const AGENTS_DIR = join(REPO_ROOT, ".ai", "agents");
export const RESULTS_DIR = join(EVALS_DIR, "results");
