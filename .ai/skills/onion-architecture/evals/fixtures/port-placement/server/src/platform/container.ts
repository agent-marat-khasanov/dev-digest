import type { LLMProvider, GitHubClient, SecretsProvider } from '../vendor/shared/adapters'
import type { Clock } from '../adapters/clock'
import { SystemClock } from '../adapters/clock'
import { OpenAIProvider } from '../adapters/llm/openai'
import { OctokitGitHubClient } from '../adapters/github/octokit'
import { FileSecretsProvider } from '../adapters/secrets/file'
import { loadConfig, type AppConfig } from './config'

export interface ContainerOverrides {
  llm?: LLMProvider
  github?: GitHubClient
  secrets?: SecretsProvider
  clock?: Clock
}

export class Container {
  readonly config: AppConfig
  readonly llm: LLMProvider
  readonly github: GitHubClient
  readonly secrets: SecretsProvider
  readonly clock: Clock

  constructor(overrides: ContainerOverrides = {}) {
    this.config = loadConfig()
    this.secrets = overrides.secrets ?? new FileSecretsProvider(this.config.secretsPath)
    this.llm = overrides.llm ?? new OpenAIProvider(this.secrets)
    this.github = overrides.github ?? new OctokitGitHubClient(this.secrets)
    this.clock = overrides.clock ?? new SystemClock()
  }
}
