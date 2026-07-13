import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Brief data-access. The ONLY file that touches `pr_brief`.
 * One cached brief per PR (`prId` PK) — replaced on head change / Regenerate.
 * The full `Brief` payload (minus `pr_id`) is stored as `json`; `headSha` is
 * the dedicated cache-key column (AC-8/AC-10).
 */

export type PrBriefRow = typeof t.prBrief.$inferSelect;

export interface UpsertBriefInput {
  json: unknown;
  headSha: string;
}

export class BriefRepository {
  constructor(private db: Db) {}

  async getByPr(prId: string): Promise<PrBriefRow | null> {
    const [row] = await this.db
      .select()
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId));
    return row ?? null;
  }

  async upsert(prId: string, input: UpsertBriefInput): Promise<PrBriefRow> {
    const [row] = await this.db
      .insert(t.prBrief)
      .values({
        prId,
        json: input.json,
        headSha: input.headSha,
      })
      .onConflictDoUpdate({
        target: t.prBrief.prId,
        set: {
          json: input.json,
          headSha: input.headSha,
        },
      })
      .returning();
    // upsert always returns the row; non-null assertion is safe here
    return row!;
  }
}
