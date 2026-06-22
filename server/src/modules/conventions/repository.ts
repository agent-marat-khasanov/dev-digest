import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, RepoRow } from '../../db/rows.js';
import type { ConventionStatus } from '@devdigest/shared';

/**
 * Conventions data-access. Owns the `conventions` table. Workspace-scoped.
 * Also reads `repos` (the clone path + GitHub coordinates the extractor needs);
 * conventions are always tied to a repo, so the two are read together here.
 */

export type { ConventionRow, RepoRow };

export interface InsertConvention {
  category: string | null;
  rule: string;
  evidencePath: string | null;
  evidenceLine: string | null;
  evidenceCode: string | null;
  confidence: number | null;
}

export interface UpdateConvention {
  status?: ConventionStatus;
  category?: string | null;
  rule?: string;
  evidencePath?: string | null;
  evidenceLine?: string | null;
  evidenceCode?: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async listByRepo(
    workspaceId: string,
    repoId: string,
    status?: ConventionStatus,
  ): Promise<ConventionRow[]> {
    const where = [
      eq(t.conventions.workspaceId, workspaceId),
      eq(t.conventions.repoId, repoId),
    ];
    if (status !== undefined) where.push(eq(t.conventions.status, status));
    return this.db
      .select()
      .from(t.conventions)
      .where(and(...where));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.listByRepo(workspaceId, repoId, 'accepted');
  }

  /**
   * Replace every convention for a repo with a fresh `pending` set — a re-scan
   * is authoritative, so old candidates are dropped. Done in a transaction so
   * the table is never observed half-cleared.
   */
  async replaceForRepo(
    workspaceId: string,
    repoId: string,
    rows: InsertConvention[],
  ): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)),
        );
      if (rows.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(
          rows.map((r) => ({
            workspaceId,
            repoId,
            category: r.category,
            rule: r.rule,
            evidencePath: r.evidencePath,
            evidenceLine: r.evidenceLine,
            evidenceCode: r.evidenceCode,
            confidence: r.confidence,
            status: 'pending' as const,
          })),
        )
        .returning();
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.evidencePath !== undefined ? { evidencePath: patch.evidencePath } : {}),
        ...(patch.evidenceLine !== undefined ? { evidenceLine: patch.evidenceLine } : {}),
        ...(patch.evidenceCode !== undefined ? { evidenceCode: patch.evidenceCode } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }
}
