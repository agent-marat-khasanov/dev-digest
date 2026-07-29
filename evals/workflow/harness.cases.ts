import type { WorkflowCase } from "../src/index.js";

// Trace-asserted workflow cases — one per `kind`, per evals/README.md's "Workflow case" table.
// These run `workflowTask` against the REAL on-disk harness (CLAUDE.md + project skills/agents,
// settingSources: ["project"]), so they measure the SYSTEM, not any one artifact's content.

export const cases: WorkflowCase[] = [
  {
    kind: "dispatch",
    name: "planning an implementation from a spec dispatches the implementation-planner subagent",
    prompt:
      "Read specs/eval-pipeline.md and plan its implementation as an Implementation Plan, using the implementation-planner subagent.",
    expectSubagent: "implementation-planner",
    maxTurns: 6,
  },
  {
    kind: "activation",
    name: "adding a backend route activates the onion-architecture skill",
    prompt:
      "I need to add a new GET route to server/src/modules/tags/routes.ts that lists all tags for a workspace, wiring it through the service and repository layers.",
    skill: "onion-architecture",
    shouldActivate: true,
    maxTurns: 6,
  },
  {
    kind: "activation",
    name: "near-miss: fixing a README typo does NOT activate the onion-architecture skill",
    prompt: "There's a typo in README.md — it says 'recieve' instead of 'receive'. Please fix it.",
    skill: "onion-architecture",
    shouldActivate: false,
    maxTurns: 6,
  },
  {
    kind: "contrast",
    name: "CLAUDE.md's read-insights-first rule makes server/INSIGHTS.md get read before touching server/ — but only when CLAUDE.md is loaded",
    prompt: "I'm about to start working on the server/ package. What should I know before I touch any code there?",
    expectFileRead: "server/INSIGHTS.md",
    maxTurns: 6,
  },
];
