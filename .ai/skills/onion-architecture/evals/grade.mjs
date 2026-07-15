#!/usr/bin/env node
// Grades an onion-architecture eval run against the assertions in assertions.json.
// Usage: node grade.mjs <workspace>/iteration-N
// Writes grading.json into every run directory it finds.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ASSERTIONS = JSON.parse(readFileSync(join(HERE, 'assertions.json'), 'utf8'))

const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

// repo-relative path -> content, as proposed by the run
function loadProposal(runDir) {
  const root = join(runDir, 'outputs', 'files')
  const files = {}
  for (const abs of walk(root)) files[relative(root, abs).split('\\').join('/')] = readFileSync(abs, 'utf8')
  return files
}

const pick = (files, re) => Object.entries(files).filter(([p]) => re.test(p))
const hit = (files, pathRe, contentRe) =>
  pick(files, pathRe).find(([, c]) => contentRe.test(c))

const SERVICE = /^server\/src\/modules\/[^/]+\/service\.ts$/
const ROUTES = /^server\/src\/modules\/[^/]+\/routes\.ts$/
// `reviews` keeps its repository as a directory (repository/run.repo.ts), so a bare
// `repository.ts` match would fail a run that correctly split the query out.
const REPO = /^server\/src\/modules\/[^/]+\/repository(?:\.ts|\/.+\.ts)$/
const HELPERS = /^server\/src\/modules\/[^/]+\/helpers\.ts$/
const CORE = /^reviewer-core\//

const ok = (evidence) => ({ passed: true, evidence })
const no = (evidence) => ({ passed: false, evidence })

const CHECKS = {
  // Nothing outside server/ names a Notifier, so the port belongs beside its adapter. Putting it in
  // vendor/shared (hand-synced, mirrored into client/) widens a cross-package surface for nothing.
  '0.1': (f) => {
    const PORT = /export\s+interface\s+(\w*(?:Notifier|Notification|Slack)\w*)/i
    const shared = f['server/src/vendor/shared/adapters.ts']
    if (shared && PORT.test(shared)) return no('server-only Notifier port pushed into the client-mirrored vendor/shared/adapters.ts')
    const local = pick(f, /^server\/src\/adapters\//).find(([, c]) => PORT.test(c))
    return local ? ok(`port declared beside its adapter in ${local[0]}`) : no('no notification port interface declared anywhere')
  },
  '0.2': (f) => {
    const h = hit(f, /^server\/src\/adapters\//, /fetch\s*\(|axios|undici|https?\.request|WebClient/)
    return h ? ok(`HTTP call lives in ${h[0]}`) : no('no file under server/src/adapters/ performs the HTTP POST')
  },
  '0.3': (f) => {
    const bad = pick(f, SERVICE).find(([, c]) => /\bfetch\s*\(|axios|undici|new WebClient|https?\.request|hooks\.slack\.com/.test(c))
    return bad ? no(`${bad[0]} performs the HTTP call itself`) : ok('no service.ts performs the HTTP call')
  },
  '0.4': (f) => {
    const c = f['server/src/platform/container.ts']
    if (!c) return no('container.ts not modified — adapter is not wired at the composition root')
    return /notif|slack/i.test(c) ? ok('container.ts wires the notifier') : no('container.ts modified but does not wire the notifier')
  },
  '0.5': (f) => {
    const bad = pick(f, SERVICE).find(([, c]) => /new\s+\w*(?:Slack|Notifier|Notification)\w*\s*\(/i.test(c))
    return bad ? no(`${bad[0]} constructs the adapter itself`) : ok('service receives the notifier as an injected dependency')
  },
  '0.6': (f) => {
    const hard = Object.entries(f).find(([, c]) => /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]/.test(c))
    if (hard) return no(`hardcoded webhook URL in ${hard[0]}`)
    const cfg = Object.entries(f).find(([p, c]) => /config|secret|env/i.test(p) && /webhook|SLACK/i.test(c))
    return cfg ? ok(`webhook URL sourced from ${cfg[0]}`) : no('no config/secrets entry for the webhook URL')
  },

  '1.1': (f) => {
    const bad = pick(f, ROUTES).find(([, c]) => /drizzle-orm|db\.select|\bsql`|\bcount\s*\(/.test(c))
    return bad ? no(`${bad[0]} contains the query itself`) : ok('routes.ts contains no Drizzle/SQL')
  },
  '1.2': (f) => {
    const h = hit(f, REPO, /db\.select|\bsql`|\bcount\s*\(/)
    return h ? ok(`aggregation query in ${h[0]}`) : no('no repository.ts holds the aggregation query')
  },
  '1.3': (f) => {
    const svc = hit(f, SERVICE, /[Rr]epo(sitory)?\b/)
    const rt = hit(f, ROUTES, /[Ss]ervice|svc/)
    if (svc && rt) return ok(`${rt[0]} -> ${svc[0]} -> repository`)
    return no(`orchestration incomplete (service->repo: ${!!svc}, route->service: ${!!rt})`)
  },
  '1.4': (f) => {
    const h = hit(f, /^server\/src\/vendor\/shared\/contracts\//, /stats/i)
    return h ? ok(`Zod contract in ${h[0]}`) : no('no stats contract under vendor/shared/contracts/')
  },
  '1.5': (f) => {
    const h = hit(f, HELPERS, /stats|Stats/)
    return h ? ok(`row -> DTO mapping in ${h[0]}`) : no('no helpers.ts mapping — boundary mapping missing or done elsewhere')
  },
  '1.6': (f) => {
    const h = hit(f, REPO, /workspace_?[Ii]d/)
    return h ? ok(`${h[0]} filters on workspace id`) : no('aggregation query is not workspace-scoped')
  },

  '2.1': (f) => {
    const bad = pick(f, CORE).find(([, c]) => /@octokit|from ['"]octokit|new Octokit/.test(c))
    return bad ? no(`${bad[0]} imports Octokit`) : ok('reviewer-core imports no GitHub SDK')
  },
  '2.2': (f) => {
    const bad = pick(f, CORE).find(([, c]) => /\bfetch\s*\(|axios|node:fs|node:https|require\(['"]https/.test(c))
    return bad ? no(`${bad[0]} performs I/O`) : ok('reviewer-core performs no network/filesystem I/O')
  },
  '2.3': (f) => {
    const usesPort = Object.entries(f).find(([p, c]) => !CORE.test(p) && /[Gg]it[Hh]ubClient/.test(c))
    const adhoc = Object.entries(f).find(([p, c]) => !/^server\/src\/adapters\//.test(p) && /new Octokit\s*\(/.test(c))
    if (adhoc) return no(`ad-hoc Octokit constructed in ${adhoc[0]}`)
    return usesPort ? ok(`GitHub reached via the GitHubClient port in ${usesPort[0]}`) : no('no use of the existing GitHubClient port')
  },
  '2.4': (f) => {
    const h = hit(f, CORE, /openPr|open_prs|openPullRequests|conflict|touchedBy|otherPrs/i)
    if (!h) return no('reviewer-core never receives open-PR data as input')
    const pure = !/@octokit|new Octokit|\bfetch\s*\(/.test(h[1])
    return pure ? ok(`${h[0]} takes the open-PR data as plain input`) : no(`${h[0]} fetches the data itself`)
  },
  '2.5': (f) => {
    const c = f['reviewer-core/package.json']
    if (!c) return ok('reviewer-core/package.json untouched')
    return /octokit|axios|node-fetch|undici/.test(c) ? no('a GitHub/HTTP dependency was added to reviewer-core') : ok('no GitHub/HTTP dependency added to reviewer-core')
  },

  '3.1': (f) => {
    const PORT = /export\s+interface\s+(\w*Cache\w*)/i
    const shared = f['server/src/vendor/shared/adapters.ts']
    if (shared && PORT.test(shared)) return no('server-only cache port pushed into the client-mirrored vendor/shared/adapters.ts')
    const local = pick(f, /^server\/src\/adapters\//).find(([, c]) => PORT.test(c))
    return local ? ok(`cache port declared beside its adapter in ${local[0]}`) : no('no cache port interface declared')
  },
  '3.2': (f) => {
    const bad = Object.entries(f).find(([p, c]) => !/^server\/src\/adapters\//.test(p) && /new\s+Redis\s*\(|createClient\s*\(/.test(c))
    return bad ? no(`Redis client constructed outside an adapter, in ${bad[0]}`) : ok('Redis client is constructed only inside adapters/')
  },
  '3.3': (f) => {
    const c = f['server/src/platform/container.ts']
    if (!c) return no('container.ts not modified — the cache is not composed at the root')
    const wired = /cache/i.test(c)
    const override = /cache\??\s*:/i.test(c)
    return wired && override ? ok('container resolves the cache and exposes a ContainerOverrides slot') : no(`container.ts wires cache=${wired}, overrides slot=${override}`)
  },
  '3.4': (f) => {
    const bad = Object.entries(f).find(([p, c]) => !/^server\/src\/adapters\//.test(p) && /from ['"](ioredis|redis)['"]/.test(c))
    return bad ? no(`${bad[0]} imports the Redis SDK directly`) : ok('callers code against the port, not Redis types')
  },
  '3.5': (f) => {
    const hard = Object.entries(f).find(([, c]) => /['"]redis:\/\/[^'"]*['"]/.test(c) && !/example|\.env/i.test(c))
    if (hard) return no(`hardcoded Redis URL in ${hard[0]}`)
    const cfg = Object.entries(f).find(([p, c]) => /config|\.env/i.test(p) && /REDIS/i.test(c))
    return cfg ? ok(`Redis URL sourced from ${cfg[0]}`) : no('no config/env entry for the Redis URL')
  },

  '4.1': (f) => {
    const bad = pick(f, CORE).find(([, c]) => /from ['"][^'"]*\.\.\/server\/|from ['"]@\/|from ['"]server\//.test(c))
    return bad ? no(`${bad[0]} imports from server/`) : ok('reviewer-core imports nothing from server/')
  },
  '4.2': (f) => {
    const bad = pick(f, CORE).find(([, c]) => /from ['"](pino|fastify)['"]|\bFastifyBaseLogger\b|require\(['"]pino/.test(c))
    return bad ? no(`${bad[0]} imports a logger/Fastify`) : ok('reviewer-core imports no logger or Fastify')
  },
  // The seam already exists and is called `onEvent` (reviewer-core/src/review/run.ts:92) — a run that
  // enriches it rather than inventing a new channel is doing the right thing.
  '4.3': (f) => {
    const h = hit(f, CORE, /onEvent|onProgress|ProgressReporter|onStage|emitProgress/)
    if (!h) return no('reviewer-core never receives an injected progress handler')
    const emits = /stage|Stage/.test(h[1])
    return emits ? ok(`stages leave the core through the injected sink (${h[0]})`) : no(`${h[0]} takes a sink but never reports a stage`)
  },
  // The server already forwards onEvent into the run bus (run-executor.ts:240). A proposal that touches
  // no server file is reusing that wiring intact — absence of a change is the correct answer here, so
  // only a *proposed* server file that drops the handler counts as a failure.
  '4.4': (f) => {
    const serverFiles = pick(f, /^server\//)
    if (!serverFiles.length) return ok('no server change proposed — reuses the existing onEvent wiring in run-executor.ts')
    const h = serverFiles.find(([, c]) => /onEvent|onProgress|onStage/.test(c))
    return h ? ok(`server supplies the progress handler in ${h[0]}`) : no('server files proposed, but none supplies the progress handler')
  },
  '4.5': (f) => {
    const bad = pick(f, CORE).find(([, c]) => /\bfetch\s*\(|axios|node:fs|node:https/.test(c))
    return bad ? no(`${bad[0]} performs I/O`) : ok('reviewer-core performs no network/filesystem I/O')
  },
}

const iterationDir = process.argv[2]
if (!iterationDir) {
  console.error('usage: node grade.mjs <workspace>/iteration-N')
  process.exit(1)
}

const summary = []
for (const evalSpec of ASSERTIONS.evals) {
  const evalDir = join(iterationDir, `eval-${evalSpec.eval_id}-${evalSpec.eval_name}`)
  for (const config of ['with_skill', 'without_skill']) {
    const runDir = join(evalDir, config)
    if (!existsSync(join(runDir, 'outputs'))) continue
    const files = loadProposal(runDir)
    const expectations = evalSpec.assertions.map((a) => {
      const { passed, evidence } = CHECKS[a.id](files)
      return { text: `[${a.id}] ${a.text}`, passed, evidence, rule: a.rule }
    })
    const passed = expectations.filter((e) => e.passed).length
    const total = expectations.length
    const grading = {
      eval_id: evalSpec.eval_id,
      eval_name: evalSpec.eval_name,
      config,
      files_proposed: Object.keys(files).length,
      expectations,
      score: `${passed}/${total}`,
      summary: { passed, failed: total - passed, total, pass_rate: Number((passed / total).toFixed(4)) },
    }
    writeFileSync(join(runDir, 'grading.json'), JSON.stringify(grading, null, 2) + '\n')

    // aggregate_benchmark.py expects <config>/run-N/grading.json (it supports repeated runs);
    // the viewer reads <config>/outputs + <config>/grading.json. Satisfy both layouts.
    const runN = join(runDir, 'run-1')
    mkdirSync(runN, { recursive: true })
    writeFileSync(join(runN, 'grading.json'), JSON.stringify(grading, null, 2) + '\n')
    if (existsSync(join(runDir, 'timing.json'))) copyFileSync(join(runDir, 'timing.json'), join(runN, 'timing.json'))

    // The viewer only embeds top-level files in outputs/, so flatten the proposed tree into
    // one readable document — otherwise a human reviewer never sees the actual code.
    const flat = Object.entries(files)
      .sort()
      .map(([p, c]) => `## \`${p}\`\n\n\`\`\`${p.endsWith('.json') ? 'json' : p.endsWith('.example') ? 'sh' : 'ts'}\n${c.trimEnd()}\n\`\`\`\n`)
      .join('\n')
    writeFileSync(join(runDir, 'outputs', 'PROPOSED-FILES.md'), `# Proposed files (${Object.keys(files).length})\n\n${flat}`)

    summary.push({ eval: evalSpec.eval_name, config, score: `${passed}/${total}`, files: Object.keys(files).length })
  }
}

console.table(summary)
