export interface LLMProvider {
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<string>
  countTokens(text: string): Promise<number>
}

export interface GitHubClient {
  getPullRequestDiff(repoFullName: string, prNumber: number): Promise<string>
  listPullRequestFiles(repoFullName: string, prNumber: number): Promise<string[]>
  postReviewComment(repoFullName: string, prNumber: number, body: string): Promise<void>
}

export interface SecretsProvider {
  get(key: string): Promise<string | undefined>
}

export interface ArchiveStore {
  put(key: string, content: Buffer, contentType: string): Promise<string>
  get(key: string): Promise<Buffer | undefined>
  presign(key: string, ttlSeconds: number): Promise<string>
}
