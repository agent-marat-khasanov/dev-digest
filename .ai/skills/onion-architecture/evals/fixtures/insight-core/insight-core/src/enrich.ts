import type { FindingGroup } from './types'

export async function enrichWithOwnership(
  groups: FindingGroup[],
  repoFullName: string,
): Promise<FindingGroup[]> {
  const enriched: FindingGroup[] = []

  for (const group of groups) {
    const owners = new Set<string>()

    for (const file of group.files.slice(0, 3)) {
      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/commits?path=${encodeURIComponent(file)}&per_page=5`,
        { headers: { Accept: 'application/vnd.github+json' } },
      )
      if (!response.ok) continue
      const commits = (await response.json()) as Array<{ author?: { login?: string } }>
      for (const commit of commits) {
        if (commit.author?.login) owners.add(commit.author.login)
      }
    }

    enriched.push({ ...group, owners: [...owners] })
  }

  return enriched
}
