#!/usr/bin/env node
// Collects run metrics for /workflow-retro from Claude Code session transcripts.
// Emits JSON on stdout. Usage: node scripts/retro.mjs [session-id | last]

import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROJECT_DIR = join(homedir(), '.claude', 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'))

async function listSessions() {
  const entries = await readdir(PROJECT_DIR, { withFileTypes: true })
  const sessions = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
    const id = e.name.slice(0, -6)
    const { mtimeMs } = await stat(join(PROJECT_DIR, e.name))
    let agentFiles = []
    try {
      const sub = await readdir(join(PROJECT_DIR, id, 'subagents'))
      agentFiles = sub.filter((f) => f.endsWith('.jsonl'))
    } catch {}
    sessions.push({ id, mtimeMs, agentFiles })
  }
  return sessions.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

async function resolveSession(arg) {
  const sessions = await listSessions()
  if (!sessions.length) throw new Error(`No transcripts in ${PROJECT_DIR}`)
  if (!arg) return sessions[0]
  if (arg === 'last') {
    const withAgents = sessions.find((s) => s.agentFiles.length > 0)
    if (!withAgents) throw new Error('No session with subagents found')
    return withAgents
  }
  const match = sessions.find((s) => s.id.startsWith(arg))
  if (!match) throw new Error(`No session matching "${arg}"`)
  return match
}

// An agent resumed via SendMessage hours later leaves a huge hole in its transcript. Splitting the
// timeline on idle gaps keeps "how long did this actually run" honest — first-to-last would report
// a 10-minute agent as a 13-hour one.
const IDLE_GAP_MS = 5 * 60 * 1000

const emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

function toSegments(timestamps) {
  if (!timestamps.length) return []
  const sorted = [...timestamps].sort((a, b) => a - b)
  const segments = [[sorted[0], sorted[0]]]
  for (const ts of sorted.slice(1)) {
    const current = segments[segments.length - 1]
    if (ts - current[1] > IDLE_GAP_MS) segments.push([ts, ts])
    else current[1] = ts
  }
  return segments
}

// One API response spans several JSONL lines (one per content block), each repeating the same
// usage object. Counting every line multiplies output tokens ~5x — dedupe on message.id.
async function parseTranscript(file) {
  const seen = new Set()
  const out = {
    usage: emptyUsage(),
    responses: 0,
    models: new Set(),
    tools: {},
    toolCalls: 0,
    filesRead: new Set(),
    skills: new Set(),
    toolErrors: 0,
    timestamps: [],
    taskResults: [],
  }

  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }

    if (rec.timestamp) out.timestamps.push(Date.parse(rec.timestamp))

    const msg = rec.message
    const usage = msg?.usage
    if (usage && msg.id && !seen.has(msg.id)) {
      seen.add(msg.id)
      out.responses++
      out.usage.input += usage.input_tokens ?? 0
      out.usage.output += usage.output_tokens ?? 0
      out.usage.cacheRead += usage.cache_read_input_tokens ?? 0
      out.usage.cacheWrite += usage.cache_creation_input_tokens ?? 0
      if (msg.model) out.models.add(msg.model)
    }

    if (Array.isArray(msg?.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          out.toolCalls++
          out.tools[block.name] = (out.tools[block.name] ?? 0) + 1
          if (block.name === 'Read' && block.input?.file_path) out.filesRead.add(block.input.file_path)
          if (block.name === 'Skill' && block.input?.skill) out.skills.add(block.input.skill)
        }
        if (block.type === 'tool_result' && block.is_error) out.toolErrors++
      }
    }

    // The parent records what it *thinks* each subagent cost. Kept to expose the undercount.
    const tr = rec.toolUseResult
    if (tr && typeof tr === 'object' && !Array.isArray(tr) && tr.agentId) {
      out.taskResults.push({
        agentId: tr.agentId,
        agentType: tr.agentType,
        status: tr.status,
        model: tr.resolvedModel,
        reportedTokens: tr.totalTokens ?? 0,
        reportedDurationMs: tr.totalDurationMs ?? 0,
        reportedToolCalls: tr.totalToolUseCount ?? 0,
      })
    }
  }
  return out
}

const totalOf = (u) => u.input + u.output + u.cacheRead + u.cacheWrite
const cacheHit = (u) => {
  const served = u.cacheRead + u.cacheWrite + u.input
  return served === 0 ? 0 : Number((u.cacheRead / served).toFixed(4))
}

function shape(parsed) {
  const segments = toSegments(parsed.timestamps)
  const activeMs = segments.reduce((sum, [s, e]) => sum + (e - s), 0)
  const first = segments[0]?.[0] ?? null
  const last = segments[segments.length - 1]?.[1] ?? null

  return {
    responses: parsed.responses,
    models: [...parsed.models],
    tokens: { ...parsed.usage, total: totalOf(parsed.usage) },
    cacheHitRatio: cacheHit(parsed.usage),
    toolCalls: parsed.toolCalls,
    tools: parsed.tools,
    toolErrors: parsed.toolErrors,
    activeMs,
    spanMs: first && last ? last - first : 0,
    wasResumed: segments.length > 1,
    segments: segments.map(([s, e]) => [new Date(s).toISOString(), new Date(e).toISOString()]),
    startedAt: first ? new Date(first).toISOString() : null,
    endedAt: last ? new Date(last).toISOString() : null,
  }
}

// Merged union of every agent's ACTIVE segments — the wall clock the fleet actually occupied.
function concurrency(agents) {
  const spans = agents.flatMap((a) => a.segments.map(([s, e]) => [Date.parse(s), Date.parse(e)]))
  if (!spans.length) return { maxConcurrent: 0, wallClockMs: 0, serialMs: 0, parallelismFactor: 0 }

  const events = spans.flatMap(([s, e]) => [
    [s, 1],
    [e, -1],
  ])
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  let active = 0
  let maxConcurrent = 0
  for (const [, delta] of events) {
    active += delta
    if (active > maxConcurrent) maxConcurrent = active
  }

  const merged = []
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }
  const wallClockMs = merged.reduce((sum, [s, e]) => sum + (e - s), 0)
  const serialMs = spans.reduce((sum, [s, e]) => sum + (e - s), 0)

  return {
    maxConcurrent,
    wallClockMs,
    serialMs,
    parallelismFactor: wallClockMs === 0 ? 0 : Number((serialMs / wallClockMs).toFixed(2)),
  }
}

async function main() {
  const session = await resolveSession(process.argv[2])
  const mainParsed = await parseTranscript(join(PROJECT_DIR, `${session.id}.jsonl`))

  const agents = []
  for (const file of session.agentFiles.sort()) {
    const agentId = file.replace(/^agent-|\.jsonl$/g, '')
    const dir = join(PROJECT_DIR, session.id, 'subagents')
    let meta = {}
    try {
      meta = JSON.parse(await readFile(join(dir, `agent-${agentId}.meta.json`), 'utf8'))
    } catch {}

    const parsed = await parseTranscript(join(dir, file))
    const reported = mainParsed.taskResults.find((t) => t.agentId === agentId)

    agents.push({
      agentId,
      agentType: meta.agentType ?? reported?.agentType ?? 'unknown',
      description: meta.description ?? null,
      spawnDepth: meta.spawnDepth ?? 1,
      status: reported?.status ?? 'unknown',
      ...shape(parsed),
      filesRead: [...parsed.filesRead],
      skillsInvoked: [...parsed.skills],
      parentReportedTokens: reported?.reportedTokens ?? null,
    })
  }

  const byType = {}
  for (const a of agents) {
    const t = (byType[a.agentType] ??= { count: 0, tokens: 0, output: 0, activeMs: 0, toolCalls: 0 })
    t.count++
    t.tokens += a.tokens.total
    t.output += a.tokens.output
    t.activeMs += a.activeMs
    t.toolCalls += a.toolCalls
  }
  for (const t of Object.values(byType)) {
    t.meanTokens = Math.round(t.tokens / t.count)
    t.meanOutput = Math.round(t.output / t.count)
    t.meanActiveMs = Math.round(t.activeMs / t.count)
  }

  // Same file read by several agents = context every one of them paid for separately.
  const readers = {}
  for (const a of agents) {
    for (const f of a.filesRead) (readers[f] ??= []).push(a.agentType)
  }
  const duplicateReads = Object.entries(readers)
    .filter(([, who]) => who.length > 1)
    .map(([file, who]) => ({ file, readers: who.length, agentTypes: [...new Set(who)] }))
    .sort((a, b) => b.readers - a.readers)

  const mainShaped = shape(mainParsed)
  const agentTokens = agents.reduce((sum, a) => sum + a.tokens.total, 0)

  // A backgrounded agent's Task result returns before the agent finishes, so the parent books it at
  // ~0 tokens. Only agents the parent actually saw finish can be compared against their transcripts.
  const comparable = agents.filter((a) => a.status === 'completed' && a.parentReportedTokens > 0)
  const reportedSum = comparable.reduce((sum, a) => sum + a.parentReportedTokens, 0)
  const realSum = comparable.reduce((sum, a) => sum + a.tokens.total, 0)

  const report = {
    sessionId: session.id,
    generatedFrom: PROJECT_DIR,
    main: mainShaped,
    agents,
    byAgentType: byType,
    concurrency: concurrency(agents),
    duplicateReads,
    totals: {
      agentCount: agents.length,
      mainTokens: mainShaped.tokens.total,
      agentTokens,
      grandTotalTokens: mainShaped.tokens.total + agentTokens,
      // Cache reads dominate the raw total but are the cheapest tokens there are. Keep the four
      // categories visible so nobody reads the grand total as "what this cost".
      breakdown: {
        input: mainShaped.tokens.input + agents.reduce((s, a) => s + a.tokens.input, 0),
        output: mainShaped.tokens.output + agents.reduce((s, a) => s + a.tokens.output, 0),
        cacheWrite: mainShaped.tokens.cacheWrite + agents.reduce((s, a) => s + a.tokens.cacheWrite, 0),
        cacheRead: mainShaped.tokens.cacheRead + agents.reduce((s, a) => s + a.tokens.cacheRead, 0),
      },
      toolCalls: mainShaped.toolCalls + agents.reduce((s, a) => s + a.toolCalls, 0),
      // What the parent booked for its subagents vs. what their own transcripts show.
      inContextUndercount: {
        comparableAgents: comparable.length,
        excludedAgents: agents.length - comparable.length,
        parentReportedTokens: reportedSum,
        realTokens: realSum,
        factor: reportedSum === 0 ? null : Number((realSum / reportedSum).toFixed(1)),
      },
    },
  }

  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

main().catch((err) => {
  process.stderr.write(`retro: ${err.message}\n`)
  process.exit(1)
})
