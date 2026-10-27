import { describe, expect, it } from 'vitest'
import { analyzeWorkflow } from './analyze'
import { parseWorkflow } from './parse-workflow'
import type { Analysis } from '../types'

const SHA = '11bd71901bbe5b1630ceea73d27597364c9af683'

function analyze(source: string): Analysis {
  const { workflow, error } = parseWorkflow(source)
  if (!workflow) throw new Error(`Fixture did not parse: ${error}`)
  return analyzeWorkflow(workflow)
}

function rules(analysis: Analysis): string[] {
  return analysis.findings.map((finding) => finding.rule)
}

describe('analyzeWorkflow', () => {
  it('keeps a pinned, read-only workflow clean', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@${SHA}
      - run: npm test
`)
    expect(analysis.findings).toEqual([])
    expect(analysis.counts).toEqual({ critical: 0, warning: 0, info: 0 })
    expect(analysis.stats).toEqual({
      jobs: 1,
      steps: 2,
      actions: 1,
      instances: 1,
      dynamicMatrices: 0,
      triggers: 1,
    })
  })

  it('flags pull_request_target, write-all, fork checkout and injection', () => {
    const analysis = analyze(`on: pull_request_target
permissions: write-all
jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - run: echo "\${{ github.event.pull_request.title }}"
      - run: ./scripts/preview.sh
        env:
          API_TOKEN: sk_live_demo_value
`)
    expect(rules(analysis)).toEqual(
      expect.arrayContaining([
        'pull-request-target',
        'write-all',
        'pr-target-untrusted-checkout',
        'unpinned-action',
        'script-injection',
        'hardcoded-secret',
        'missing-timeout',
      ]),
    )
    expect(analysis.counts.critical).toBe(4)
    expect(analysis.findings.find((finding) => finding.rule === 'script-injection')?.step).toBe(1)
  })

  it('does not flag a privileged trigger with a safe checkout', () => {
    const analysis = analyze(`on: pull_request_target
permissions:
  contents: read
jobs:
  label:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@${SHA}
        with:
          ref: \${{ github.base_ref }}
      - uses: actions/github-script@${SHA}
        with:
          script: console.log(context.payload.pull_request.number)
`)
    expect(rules(analysis)).toContain('pull-request-target')
    expect(rules(analysis)).not.toContain('pr-target-untrusted-checkout')
    expect(analysis.counts.critical).toBe(0)
  })

  it('detects script injection from several untrusted contexts', () => {
    const analysis = analyze(`on: pull_request
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo "\${{ inputs.name }}"
      - run: echo "\${{ github.head_ref }}"
      - run: echo "\${{ github.ref_name }}"
`)
    const injections = analysis.findings.filter(
      (finding) => finding.rule === 'script-injection',
    )
    expect(injections).toHaveLength(3)
  })

  it('does not flag safe expressions in run steps', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo "\${{ matrix.node }} \${{ runner.os }}"
        env:
          NAME: \${{ github.event.head_commit.message }}
`)
    expect(rules(analysis)).not.toContain('script-injection')
  })

  it('flags unpinned actions but accepts SHAs, local actions and docker refs', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/local
      - uses: docker://alpine:3.20
      - uses: actions/setup-node@${SHA}
`)
    const unpinned = analysis.findings.filter(
      (finding) => finding.rule === 'unpinned-action',
    )
    expect(unpinned).toHaveLength(1)
    expect(unpinned[0]?.detail).toContain('actions/checkout@v4')
  })

  it('warns when permissions are inherited from repository defaults', () => {
    const analysis = analyze(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo hi
`)
    expect(rules(analysis)).toContain('missing-permissions')
    expect(analysis.counts.warning).toBe(1)
  })

  it('does not warn when every job declares permissions', () => {
    const analysis = analyze(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
    steps:
      - run: echo hi
`)
    expect(rules(analysis)).not.toContain('missing-permissions')
  })

  it('flags job-level write-all', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions: write-all
    steps:
      - run: echo hi
`)
    expect(rules(analysis)).toContain('write-all')
    expect(analysis.counts.critical).toBe(1)
  })

  it('detects literal secrets without printing the value', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
env:
  API_TOKEN: super-secret-value
  SAFE_TOKEN: \${{ secrets.SAFE_TOKEN }}
  PASSWORD: changeme
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@${SHA}
        with:
          token: ghp_abcdefghijklmnopqrstuvwxyz123456
      - run: echo "token ghp_abcdefghijklmnopqrstuvwxyz123456"
`)
    const secrets = analysis.findings.filter(
      (finding) => finding.rule === 'hardcoded-secret',
    )
    expect(secrets).toHaveLength(3)
    expect(JSON.stringify(analysis.findings)).not.toContain('super-secret-value')
    expect(JSON.stringify(analysis.findings)).not.toContain(
      'ghp_abcdefghijklmnopqrstuvwxyz123456',
    )
    expect(secrets.every((finding) => finding.severity === 'critical')).toBe(true)
  })

  it('flags self-hosted runners', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: [self-hosted, linux, x64]
    timeout-minutes: 5
    steps:
      - run: echo hi
`)
    expect(rules(analysis)).toContain('self-hosted-runner')
  })

  it('flags network installers piped into a shell', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: curl -fsSL https://example.com/install.sh | bash
      - run: wget -qO- https://example.com/install.sh | sh
      - run: bash <(curl -fsSL https://example.com/install.sh)
`)
    expect(
      analysis.findings.filter((finding) => finding.rule === 'remote-script'),
    ).toHaveLength(3)
  })

  it('flags inherited secrets and unpinned reusable workflows', () => {
    const analysis = analyze(`on: workflow_run
jobs:
  notify:
    uses: acme/shared/.github/workflows/notify.yml@main
    secrets: inherit
`)
    expect(rules(analysis)).toEqual(
      expect.arrayContaining([
        'workflow-run-trigger',
        'unpinned-reusable-workflow',
        'secrets-inherit',
        'missing-permissions',
      ]),
    )
  })

  it('flags needs that point at missing jobs', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  deploy:
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: ./deploy.sh
`)
    expect(rules(analysis)).toContain('missing-needs')
    expect(analysis.counts.critical).toBe(1)
  })

  it('warns when a workflow has no trigger', () => {
    const analysis = analyze(`permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: echo hi
`)
    expect(rules(analysis)).toContain('missing-trigger')
  })

  it('adds an info finding for jobs without a timeout', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`)
    expect(rules(analysis)).toContain('missing-timeout')
  })

  it('counts matrix instances and dynamic matrices', () => {
    const analysis = analyze(`on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    strategy:
      matrix:
        node: [20, 22, 24]
    steps: []
  b:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    strategy:
      matrix: \${{ fromJSON(needs.setup.outputs.matrix) }}
    steps: []
`)
    expect(analysis.stats.instances).toBe(4)
    expect(analysis.stats.dynamicMatrices).toBe(1)
  })

  it('sorts findings by severity', () => {
    const analysis = analyze(`on: push
permissions: write-all
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`)
    expect(analysis.findings[0]?.severity).toBe('critical')
    expect(analysis.findings.at(-1)?.severity).toBe('info')
  })
})
