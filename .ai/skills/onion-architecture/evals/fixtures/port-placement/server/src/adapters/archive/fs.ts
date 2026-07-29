import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { ArchiveStore } from '../../vendor/shared/adapters'

export class FsArchiveStore implements ArchiveStore {
  constructor(
    private readonly rootDir: string,
    private readonly signingSecret: string,
  ) {}

  async put(key: string, content: Buffer): Promise<string> {
    const target = join(this.rootDir, key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
    return key
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      return await readFile(join(this.rootDir, key))
    } catch {
      return undefined
    }
  }

  async presign(key: string, ttlSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds
    const signature = createHmac('sha256', this.signingSecret)
      .update(`${key}:${expires}`)
      .digest('hex')
    return `/exports/${encodeURIComponent(key)}?expires=${expires}&sig=${signature}`
  }
}
