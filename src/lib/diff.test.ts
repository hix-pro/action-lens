import { describe, expect, it } from 'vitest'
import { analyzeWorkflow } from './analyze'
import { diffLabel, diffWorkflow } from './diff'
import { parseWorkflow } from './parse-workflow'
import type { Workflow } from '../types'

const BASE = `name: CI
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - name: Test
        run: npm test
  deploy:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - name: Deploy
        run: ./deploy.sh
`

function parse(source: string): Workflow {
  const { workflow, error } = parseWorkflow(source)
  if (!workflow) throw new Error(`Fixture did not parse: ${error}`)
  return workflow
}

function compare(beforeSource: string, afterSource: string) {
  const before = parse(beforeSource)
  const after = parse(afterSource)
  return diffWorkflow(before, after, analyzeWorkflow(before), analyzeWorkflow(after))
}

describe('diffWorkflow', () => {
  it('reports no changes for identical revisions', () => {
    const diff = compare(BASE, BASE)
    expect(diff.hasChanges).toBe(false)
    expect(diff.counts).toEqual({
      jobsAdded: 0,
      jobsRemoved: 0,
      jobsChanged: 0,
      stepsAdded: 0,
      stepsRemoved: 0,
      findingsIntroduced: 0,
      findingsResolved: 0,
    })
    expect(diffLabel(diff)).toBe('No differences')
  })

  it('lists added and removed jobs', () => {
    const diff = compare(
      BASE,
      BASE.replace(
        '  deploy:\n    runs-on: ubuntu-latest\n    needs: test\n    steps:\n      - name: Deploy\n        run: ./deploy.sh\n',
        '  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run lint\n',
      ),
    )
    expect(diff.jobs.added).toEqual(['lint'])
    expect(diff.jobs.removed).toEqual(['deploy'])
    expect(diffLabel(diff)).toContain('1 added')
    expect(diffLabel(diff)).toContain('1 removed')
  })

  it('describes job-level changes', () => {
    const diff = compare(
      BASE,
      BASE.replace(
        '    runs-on: ubuntu-latest\n    needs: test',
        '    runs-on: self-hosted\n    needs: [test, lint]\n    permissions:\n      contents: write',
      ).replace('    steps:\n      - name: Deploy', '    timeout-minutes: 15\n    steps:\n      - name: Deploy'),
    )
    const deploy = diff.jobs.changed.find((job) => job.id === 'deploy')
    expect(deploy?.changes).toEqual(
      expect.arrayContaining([
        { field: 'runs-on', before: 'ubuntu-latest', after: 'self-hosted' },
        { field: 'needs', before: 'test', after: 'lint, test' },
        { field: 'permissions.contents', before: 'default', after: 'write' },
        { field: 'timeout-minutes', before: '—', after: '15' },
      ]),
    )
  })

  it('describes step additions, removals and hidden script changes', () => {
    const diff = compare(
      BASE,
      BASE.replace(
        '      - name: Test\n        run: npm test\n',
        '      - name: Lint\n        run: npm run lint\n      - name: Test\n        run: npm test -- --coverage\n',
      ),
    )
    expect(diff.steps.added).toEqual([{ job: 'test', label: 'Lint' }])
    const testStep = diff.steps.changed.find((step) => step.label === 'Test')
    expect(testStep?.changes).toContainEqual({
      field: 'run',
      before: 'script',
      after: 'script changed (hidden)',
    })
    expect(JSON.stringify(diff)).not.toContain('npm test')
    expect(JSON.stringify(diff)).not.toContain('--coverage')
  })

  it('pairs an action version bump as a step change instead of an add and remove', () => {
    const before = BASE.replace(
      '      - name: Test',
      '      - name: Set up Node.js\n        uses: actions/setup-node@v4\n      - name: Test',
    )
    const diff = compare(before, before.replace('actions/setup-node@v4', 'actions/setup-node@v7'))

    expect(diff.steps.added).toEqual([])
    expect(diff.steps.removed).toEqual([])
    const test = diff.jobs.changed.find((job) => job.id === 'test')
    expect(test?.changes).toContainEqual({
      field: 'step 2 · Set up Node.js · uses',
      before: 'actions/setup-node@v4',
      after: 'actions/setup-node@v7',
    })
  })

  it('redacts secret-looking environment values', () => {
    const before = BASE.replace(
      '    steps:\n      - name: Deploy',
      '    env:\n      API_TOKEN: old-token\n    steps:\n      - name: Deploy',
    )
    const diff = compare(
      before,
      before.replace('API_TOKEN: old-token', 'API_TOKEN: new-token'),
    )
    const deploy = diff.jobs.changed.find((job) => job.id === 'deploy')
    expect(deploy?.changes).toContainEqual({
      field: 'env.API_TOKEN',
      before: '•••• (hidden)',
      after: '•••• (hidden)',
    })
    expect(JSON.stringify(diff)).not.toContain('old-token')
    expect(JSON.stringify(diff)).not.toContain('new-token')
  })

  it('reports trigger and schedule changes', () => {
    const diff = compare(
      BASE,
      BASE.replace(
        'on:\n  push:\n  pull_request:',
        'on:\n  push:\n  pull_request:\n  schedule:\n    - cron: "0 6 * * 1"',
      ),
    )
    expect(diff.workflow).toContainEqual({
      field: 'on',
      before: 'pull_request, push',
      after: 'pull_request, push, schedule',
    })
    expect(diff.workflow).toContainEqual({
      field: 'schedule',
      before: '—',
      after: '0 6 * * 1',
    })
  })

  it('reports findings introduced by the new revision', () => {
    const diff = compare(
      BASE,
      BASE.replace(
        '    steps:\n      - name: Deploy',
        '    permissions: write-all\n    steps:\n      - name: Deploy',
      ),
    )
    expect(diff.findings.introduced.map((finding) => finding.rule)).toContain('write-all')
    expect(diff.counts.findingsIntroduced).toBe(1)
  })

  it('reports findings resolved by the new revision', () => {
    const unsafe = BASE.replace('permissions:\n  contents: read', 'permissions: write-all')
    const diff = compare(unsafe, BASE)
    expect(diff.findings.resolved.map((finding) => finding.rule)).toContain('write-all')
    expect(diff.counts.findingsResolved).toBe(1)
  })
})
