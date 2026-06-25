import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Risk } from '@devdigest/shared';

/**
 * Intent data-access. The ONLY file that touches `pr_intent`.
 * Workspace scoping is inherited from the PR row (pr_intent references pull_requests
 * which carries workspace_id), so queries here key only on prId.
 */

export type PrIntentRow = typeof t.prIntent.$inferSelect;

export interface UpsertIntentInput {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  risks: Risk[];
  headSha: string;
}

export class IntentRepository {
  constructor(private db: Db) {}

  async getByPr(prId: string): Promise<PrIntentRow | null> {
    const [row] = await this.db
      .select()
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    return row ?? null;
  }

  async upsert(prId: string, input: UpsertIntentInput): Promise<PrIntentRow> {
    const [row] = await this.db
      .insert(t.prIntent)
      .values({
        prId,
        intent: input.intent,
        inScope: input.inScope,
        outOfScope: input.outOfScope,
        risks: input.risks,
        headSha: input.headSha,
      })
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: input.intent,
          inScope: input.inScope,
          outOfScope: input.outOfScope,
          risks: input.risks,
          headSha: input.headSha,
        },
      })
      .returning();
    // upsert always returns the row; non-null assertion is safe here
    return row!;
  }
}
