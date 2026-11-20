import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcessSync } from '@orca/process-host'

// Why: the cross-version journeys check out shipped releases by tag and fail hard when a tag is
// missing, which is right where the releases were cut. A fork that never received those tags
// would fail every wire PR on history it doesn't have, so the workflow asks this first and only
// runs the journeys when every named release resolves.

const ROOT = resolve(import.meta.dirname, '../../../..')
const JOURNEY_DIRECTORY = 'tests/e2e/cross-version-wire'
// Exact quoted release tags only; suffixed labels such as 'v1.4.224-desktop' are not refs.
const RELEASE_TAG_LITERAL = /['"`](v\d+\.\d+\.\d+)['"`]/g
const SYNTHETIC_TAG = 'v0.0.0'
const VERSION_ORDER = new Intl.Collator('en', { numeric: true })

/** Lists the release tags the journeys name as string literals, sorted and without duplicates. */
export function collectReleaseTags(sources) {
  const tags = new Set()
  for (const source of sources) {
    for (const match of source.matchAll(RELEASE_TAG_LITERAL)) {
      if (match[1] !== SYNTHETIC_TAG) {
        tags.add(match[1])
      }
    }
  }
  return [...tags].sort(VERSION_ORDER.compare)
}

/** Reads every source file under the journey directory. */
export function readJourneySources(root = ROOT) {
  const directory = join(root, JOURNEY_DIRECTORY)
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|mts|mjs|js)$/.test(entry.name))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
}

/** Whether a tag of this name resolves to a commit in the repository at `root`. */
export function tagResolves(tag, root = ROOT) {
  const result = runProcessSync({
    program: 'git',
    args: ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`],
    cwd: root,
    timeoutMs: 30_000
  })
  return result.code === 0 && !result.timedOut
}

/** Splits the journeys' release tags into those present and those missing at `root`. */
export function checkReleaseTags(root = ROOT, resolves = tagResolves) {
  const tags = collectReleaseTags(readJourneySources(root))
  const missing = tags.filter((tag) => !resolves(tag, root))
  // No named tags means nothing can be missing, so a scan that finds none still runs the journeys.
  return { tags, missing, present: missing.length === 0 }
}

function main(env = process.env) {
  const result = checkReleaseTags()
  if (result.present) {
    console.log(`All ${result.tags.length} release tags the journeys name are present.`)
  } else {
    console.log(
      `::notice title=Cross-version journeys not run::This repository lacks ${result.missing.length} of the ${result.tags.length} release tags the journeys check out (${result.missing.join(', ')}). Push the release tags to run them; until then, check wire changes by hand.`
    )
  }
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `present=${result.present}\n`)
  }
  if (env.GITHUB_STEP_SUMMARY && !result.present) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      `Cross-version journeys **not run**: missing release tags ${result.missing.join(', ')}.\n`
    )
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
