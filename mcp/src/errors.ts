/**
 * Error types + MCP result helpers.
 *
 * Tool handlers NEVER throw: on failure they return `{ isError: true }` with a
 * short, actionable message (principle "errors lead forward"). `errText` maps a
 * caught error to that message without leaking stack traces.
 */

/** HTTP-layer failure from the DevDigest REST API. status 0 = could not connect. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** owner/repo/pr/agent could not be resolved to a DevDigest id. Message is user-facing. */
export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionError';
  }
}

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  // MCP's CallToolResult is a passthrough object ([x: string]: unknown); declaring
  // the index signature makes ToolResult assignable to a tool handler's return type.
  [key: string]: unknown;
}

/** Success result: a string is sent as-is, anything else is JSON-encoded. */
export function toolText(payload: unknown): ToolResult {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { content: [{ type: 'text', text }] };
}

/** Failure result the model can read and act on. */
export function toolError(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function truncate(s: string, max = 200): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Map any caught error to a short, actionable message (no stack traces). */
export function errText(err: unknown): string {
  if (err instanceof ResolutionError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    return err.body ? `${err.message} — ${truncate(err.body)}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
