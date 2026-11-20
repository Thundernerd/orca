import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcessSync } from '@orca/process-host'
import { parse } from 'yaml'
import {
  checkReleaseTags,
  collectReleaseTags,
  readJourneySources
} from './release-tag-preflight.mjs'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

// The identity is passed on every call: CI runners have none, and commits and annotated tags need one.
function git(cwd, ...args) {
  const result = runProcessSync({
    program: 'git',
    args: ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    cwd,
    timeoutMs: 30_000
  })
  expect(result.code, result.stderr).toBe(0)
}

function createRepository(journeySource) {
  const root = mkdtempSync(join(tmpdir(), 'orca-release-tag-preflight-'))
  directories.push(root)
  mkdirSync(join(root, 'tests/e2e/cross-version-wire/nested'), { recursive: true })
  writeFileSync(join(root, 'tests/e2e/cross-version-wire/nested/journey.test.ts'), journeySource)
  git(root, 'init', '--quiet')
  git(
    root,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'base'
  )
  return root
}

describe('collectReleaseTags', () => {
  it('finds quoted release tags once each, in version order', () => {
    expect(
      collectReleaseTags([
        'const OLD = \'v1.4.224\'\nmaterialize("v1.4.190")',
        'run(`v1.4.1000`, `v1.4.224`)'
      ])
    ).toEqual(['v1.4.190', 'v1.4.224', 'v1.4.1000'])
  })

  it('ignores suffixed labels, the synthetic checkout and tags inside prose', () => {
    expect(
      collectReleaseTags([
        "const APP = 'v1.4.224-desktop'\nconst SYN = 'v0.0.0'\n// Releases before v1.4.249 differ."
      ])
    ).toEqual([])
  })

  it('reads the release tags the real journeys check out', () => {
    expect(collectReleaseTags(readJourneySources())).toContain('v1.4.190')
  })
})

describe('checkReleaseTags', () => {
  it('reports the tags a repository is missing', () => {
    const root = createRepository("materialize('v1.4.190'); materialize('v1.4.253')")
    git(root, 'tag', 'v1.4.190')
    expect(checkReleaseTags(root)).toEqual({
      tags: ['v1.4.190', 'v1.4.253'],
      missing: ['v1.4.253'],
      present: false
    })
  })

  it('is present once every named tag resolves to a commit', () => {
    const root = createRepository("materialize('v1.4.190'); materialize('v1.4.253')")
    git(root, 'tag', 'v1.4.190')
    git(root, 'tag', '-a', '-m', 'release', 'v1.4.253')
    expect(checkReleaseTags(root)).toEqual({
      tags: ['v1.4.190', 'v1.4.253'],
      missing: [],
      present: true
    })
  })

  it('is present when the journeys name no tags, so a broken scan cannot skip them', () => {
    const root = createRepository('export {}')
    expect(checkReleaseTags(root).present).toBe(true)
  })
})

describe('cross-version-wire job', () => {
  const steps = parse(readFileSync('.github/workflows/pr.yml', 'utf8')).jobs['cross-version-wire']
    .steps

  it('runs the journeys only when the release tags are present', () => {
    const preflight = steps.findIndex((step) => step.id === 'release_tags')
    const journeys = steps.findIndex((step) =>
      String(step.run ?? '').includes('tests/e2e/cross-version-wire/')
    )
    expect(steps[preflight].run).toContain(
      'config/scripts/ci/cross-version-wire/release-tag-preflight.mjs'
    )
    expect(preflight).toBeGreaterThan(-1)
    expect(journeys).toBeGreaterThan(preflight)
    expect(steps[journeys].if).toBe("steps.release_tags.outputs.present == 'true'")
  })
})
