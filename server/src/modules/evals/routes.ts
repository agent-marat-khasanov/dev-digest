import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalCase,
  EvalCaseInput,
  EvalCaseSummary,
  EvalDashboard,
  EvalDashboardOverview,
  EvalRunRecord,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalsService } from './service.js';

/**
 * Evals module.
 *
 * Skill-scoped flow (pre-existing lesson):
 *   GET    /skills/:id/evals              → eval cases + latest-run summary
 *   POST   /skills/:id/evals/run          → run every case (real LLM) → summaries
 *   POST   /skills/:id/evals/:caseId/run  → run one case (real LLM) → summary
 *   DELETE /skills/:id/evals/:caseId      → delete a case
 *
 * Agent-scoped flow (L06):
 *   POST   /findings/:id/eval-case            → mint a case from an accepted/dismissed finding
 *   GET    /agents/:id/evals                  → agent's eval cases + latest-run summary
 *   GET    /agents/:id/eval-runs/estimate      → pre-run-all cost estimate
 *   POST   /agents/:id/eval-runs               → run every case (confirm-gated) → summaries
 *   POST   /agents/:id/evals/:caseId/run       → run one case (no confirm) → summary
 *   POST   /agents/:id/evals                  → create a manually-authored case
 *   GET    /agents/:id/evals/:caseId          → full case detail (edit-form hydration)
 *   PATCH  /agents/:id/evals/:caseId          → edit a case
 *   DELETE /agents/:id/evals/:caseId          → delete a case
 *   GET    /agents/:id/eval-dashboard          → per-agent dashboard aggregate
 *   GET    /agents/:id/eval-runs               → every run of the agent's cases (Compare source)
 *   GET    /eval-runs/estimate                 → pre-run-all-agents cost estimate
 *   POST   /eval-runs                          → run every agent's case set (confirm-gated)
 *   GET    /eval-dashboard                     → workspace-wide sidebar dashboard
 *
 * Cases are created via the DB seed for now — there is no create/edit route yet.
 * A run executes the skill through @devdigest/reviewer-core and scores the
 * findings against the case's expected output (see EvalsService).
 */

const CaseParams = z.object({ id: z.string().uuid(), caseId: z.string().uuid() });
const ConfirmBody = z.object({ confirm: z.boolean().default(false) });
const EstimateResponse = z.object({
  case_count: z.number().int(),
  estimated_cost_usd: z.number().nullable(),
});
const WorkspaceEstimateResponse = z.object({
  agent_count: z.number().int(),
  case_count: z.number().int(),
  estimated_cost_usd: z.number().nullable(),
});
const OkResponse = z.object({ ok: z.literal(true) });

export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalsService(app.container);

  app.get('/skills/:id/evals', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listSummaries(workspaceId, req.params.id);
  });

  app.post('/skills/:id/evals/run', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runAll(workspaceId, req.params.id);
  });

  app.post('/skills/:id/evals/:caseId/run', { schema: { params: CaseParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.runCase(workspaceId, req.params.id, req.params.caseId);
  });

  app.delete('/skills/:id/evals/:caseId', { schema: { params: CaseParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.deleteCase(workspaceId, req.params.id, req.params.caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });

  // ==========================================================================
  // Agent-scoped flow (L06)
  // ==========================================================================

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.mintFromFinding(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/evals',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listAgentSummaries(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-runs/estimate',
    { schema: { params: IdParams, response: { 200: EstimateResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.estimateAgentRun(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, body: ConfirmBody, response: { 200: z.array(EvalCaseSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runAllForAgent(workspaceId, req.params.id, req.body.confirm);
    },
  );

  app.post(
    '/agents/:id/evals/:caseId/run',
    { schema: { params: CaseParams, response: { 200: EvalCaseSummary } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runOneAgentCase(workspaceId, req.params.id, req.params.caseId);
    },
  );

  app.post(
    '/agents/:id/evals',
    { schema: { params: IdParams, body: EvalCaseInput, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.createAgentCase(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/evals/:caseId',
    { schema: { params: CaseParams, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getAgentCase(workspaceId, req.params.id, req.params.caseId);
    },
  );

  app.patch(
    '/agents/:id/evals/:caseId',
    {
      schema: {
        params: CaseParams,
        body: EvalCaseInput.partial(),
        response: { 200: EvalCase },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateAgentCase(workspaceId, req.params.id, req.params.caseId, req.body);
    },
  );

  app.delete(
    '/agents/:id/evals/:caseId',
    { schema: { params: CaseParams, response: { 200: OkResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.deleteAgentCase(workspaceId, req.params.id, req.params.caseId);
      if (!ok) throw new NotFoundError('Eval case not found');
      return { ok: true as const };
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, response: { 200: EvalDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.agentDashboard(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalRunRecord) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runsForAgent(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/estimate',
    { schema: { response: { 200: WorkspaceEstimateResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.estimateWorkspaceRun(workspaceId);
    },
  );

  app.post(
    '/eval-runs',
    { schema: { body: ConfirmBody, response: { 200: EvalDashboardOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runAllAgentsInWorkspace(workspaceId, req.body.confirm);
    },
  );

  app.get(
    '/eval-dashboard',
    { schema: { response: { 200: EvalDashboardOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.dashboardOverview(workspaceId);
    },
  );
}
