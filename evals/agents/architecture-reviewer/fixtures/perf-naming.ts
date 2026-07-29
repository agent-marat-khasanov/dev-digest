// Synthetic fixture module for architecture-reviewer evals — NOT part of the real DevDigest codebase.
// server/src/modules/tags/service.ts — layering is correct (service depends only on the injected
// repository port), but the code has bad variable names and an O(n^2) nested loop. Neither is an
// architecture issue — this fixture checks the reviewer stays out of that lane.

export interface TagsRepository {
  findAll(): Promise<{ id: string; name: string }[]>;
}

export class TagsService {
  constructor(private readonly repo: TagsRepository) {}

  async findDuplicateNames(): Promise<string[]> {
    const x = await this.repo.findAll();
    const d: string[] = [];
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < x.length; j++) {
        if (i !== j && x[i].name === x[j].name && !d.includes(x[i].name)) {
          d.push(x[i].name);
        }
      }
    }
    return d;
  }
}
