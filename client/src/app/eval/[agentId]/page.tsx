import { AgentEvalDashboardView } from "./_components/AgentEvalDashboardView";

/* Route: /eval/:agentId (Screen 2 — one agent's eval dashboard). Thin route
   entry — the view, its Compare modal, styles and helpers are colocated
   under _components/AgentEvalDashboardView. */
export default function AgentEvalDashboardPage() {
  return <AgentEvalDashboardView />;
}
