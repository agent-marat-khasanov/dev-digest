import type { McpConfig } from './config'

export class ApiClient {
  constructor(private readonly config: McpConfig) {}

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.apiUrl}${path}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`GET ${path} failed: ${res.status}`)
    }
    return (await res.json()) as T
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`POST ${path} failed: ${res.status}`)
    }
    return (await res.json()) as T
  }
}
