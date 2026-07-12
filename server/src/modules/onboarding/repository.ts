import { eq } from 'drizzle-orm';
import type { TourSection } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Onboarding data-access. The ONLY file that touches the `onboarding` table.
 * One cached tour per repo (`repo_id` PK) — replaced on SHA change / Regenerate.
 * Only `skeleton`/`model` tours are ever persisted here (AC-9/AC-11); the
 * `not_available` mode is computed per request and never reaches this table.
 */

export type OnboardingRow = typeof t.onboarding.$inferSelect;

export interface UpsertTourInput {
  sections: TourSection[];
  sha: string | null;
  model: string | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  async getByRepoId(repoId: string): Promise<OnboardingRow | null> {
    const [row] = await this.db
      .select()
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    return row ?? null;
  }

  async upsert(repoId: string, input: UpsertTourInput): Promise<OnboardingRow> {
    const [row] = await this.db
      .insert(t.onboarding)
      .values({
        repoId,
        json: input.sections,
        generatedAt: new Date(),
        sha: input.sha,
        model: input.model,
        costUsd: input.costUsd,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
      })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: {
          json: input.sections,
          generatedAt: new Date(),
          sha: input.sha,
          model: input.model,
          costUsd: input.costUsd,
          tokensIn: input.tokensIn,
          tokensOut: input.tokensOut,
        },
      })
      .returning();
    // upsert always returns the row; non-null assertion is safe here
    return row!;
  }
}
