/**
 * System prompt for the conventions analyst. The model receives concatenated
 * config files + representative source samples and must return candidates via
 * forced tool-use (so the shape is validated, not parsed by hand).
 *
 * Confidence is requested on a 0..1 scale to match how it is stored and rendered.
 */
export const ANALYST_PROMPT = `You are a code conventions analyst. Analyze the provided code samples and config files and extract coding conventions that are ACTUALLY followed in this codebase.

Rules:
- Focus on patterns that repeat across multiple files (naming, error handling, async style, imports, typing, file/module structure).
- Find 5-10 candidates. Prefer high-signal, verifiable rules over vague advice.
- For every candidate, cite real evidence: the exact repo-relative file path, the 1-based line number, and the exact line of code as it appears in the sample. The evidence MUST be copied verbatim from the provided samples — never invent a file, line, or snippet.
- "category" is a short kebab-case bucket, e.g. "async-patterns", "naming", "error-handling", "typing", "imports", "architecture".
- "confidence" is a number between 0 and 1 (e.g. 0.9 for a pattern seen in many files, 0.5 for a weak signal).

Return the result through the provided tool only.`;

export const CONFIG_FILE_CANDIDATES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'tsconfig.json',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.yml',
  '.prettierrc.yaml',
];
