/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * How many OTHER open PRs are scanned for overlapping files before a review.
 * Each one costs a `getPullRequest` call, so the newest N (GitHub returns the
 * list most-recently-updated first) bound the pre-work on busy repos.
 */
export const MAX_CONFLICT_PRS = 10;
