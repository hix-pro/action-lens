import { describe, expect, it } from 'vitest'
import { analyzeWorkflow } from './analyze'
import { buildJobGraph, JOB_NODE_HEIGHT, JOB_NODE_WIDTH } from './layout'
import { parseWorkflow } from './parse-workflow'
import {
  reportFilename,
  toJsonReport,
  toMarkdown,
  toMermaid,
  toSvg,
} from './export'
import { estimateFootprint } from './estimate'
import { defaultSample, samples } from './samples'

function workflowFor(source: string) {
  const { workflow, error } = parseWorkflow(source, '.github/workflows/ci.yml')
  if (!workflow) throw new Error(error ?? 'fixture did not parse')
  return workflow
}

function reportFor(source: string) {
  const workflow = workflowFor(source)
  return { workflow, analysis: analyzeWorkflow(workflow) }
}

const FIXTURE = `name: Demo CI
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - run: npm test
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: ./deploy.sh
`

describe('job graph', () => {
  it('creates one node per job and an edge per dependency', () => {
    const { workflow, analysis } = reportFor(FIXTURE)
    const graph = buildJobGraph(workflow, analysis.findings)
    expect(graph.nodes.map((node) => node.id)).toEqual(['build', 'deploy'])
    expect(graph.edges.map((edge) => edge.id)).toEqual(['deploy->build'])
    expect(JOB_NODE_WIDTH).toBe(280)
    expect(JOB_NODE_HEIGHT).toBe(154)
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }
  })

  it('ignores needs that point at missing jobs', () => {
    const { workflow, analysis } = reportFor(`on: push
jobs:
  deploy:
    needs: ghost
    runs-on: ubuntu-latest
    steps: []
`)
    const graph = buildJobGraph(workflow, analysis.findings)
    expect(graph.edges).toHaveLength(0)
  })

  it('adds severity counts to node data', () => {
    const { workflow, analysis } = reportFor(FIXTURE)
    const graph = buildJobGraph(workflow, analysis.findings)
    const build = graph.nodes.find((node) => node.id === 'build')
    expect(build?.data.warningCount).toBe(1)
    expect(build?.data.criticalCount).toBe(0)
  })
})

describe('exports', () => {
  it('writes a Mermaid workflow graph', () => {
    const { workflow, analysis } = reportFor(FIXTURE)
    const mermaid = toMermaid(workflow, analysis.findings)
    expect(mermaid).toContain('flowchart LR')
    expect(mermaid).toContain('j_0["build')
    expect(mermaid).toContain('j_1 -->|needs| j_0')
    expect(mermaid).toContain('classDef critical')
    expect(mermaid.endsWith('\n')).toBe(true)
  })

  it('writes a Markdown report with triggers, jobs and findings', () => {
    const { workflow, analysis } = reportFor(FIXTURE)
    const footprint = estimateFootprint(workflow)
    const markdown = toMarkdown(workflow, analysis, footprint)
    expect(markdown).toContain('# ActionLens report — Demo CI')
    expect(markdown).toContain('**Triggers:** push, pull_request')
    expect(markdown).toContain('| `build` | ubuntu-latest |')
    expect(markdown).toContain('### Warning')
    expect(markdown).toContain('**Fix:**')
    expect(markdown).toContain('## Run footprint')
  })

  it('includes a private-repo cost caveat', () => {
    const { workflow, analysis } = reportFor(FIXTURE)
    const markdown = toMarkdown(workflow, analysis, estimateFootprint(workflow, 4))
    expect(markdown).toContain('4 minutes per job')
    expect(markdown).toContain('public repositories are free')
  })

  it('writes a JSON report without step script contents or values', () => {
    const { workflow, analysis } = reportFor(`name: Demo CI
on: push
permissions:
  contents: read
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        env:
          TOKEN: super-secret-value
`)
    const report = JSON.parse(
      toJsonReport(workflow, analysis, estimateFootprint(workflow)),
    ) as {
      tool: string
      version: number
      name: string
      jobs: { steps: { envKeys: string[]; hasRun: boolean }[] }[]
      findings: { rule: string }[]
    }
    expect(report.tool).toBe('action-lens')
    expect(report.version).toBe(1)
    expect(report.name).toBe('Demo CI')
    expect(report.jobs[0]?.steps[0]?.envKeys).toEqual(['TOKEN'])
    expect(report.findings.some((finding) => finding.rule === 'hardcoded-secret')).toBe(true)
    expect(JSON.stringify(report)).not.toContain('super-secret-value')
  })

  it('renders a standalone SVG graph', () => {
    const { workflow, analysis } = reportFor(FIXTURE)
    const svg = toSvg(workflow, analysis.findings)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('</svg>')
    expect(svg).toContain('build')
    expect(svg).toContain('Demo CI')
    expect(svg).toContain('marker-end="url(#arrow)"')
  })

  it('escapes XML and Markdown table content', () => {
    const { workflow, analysis } = reportFor(`name: 'CI & release'
on: push
permissions:
  contents: read
jobs:
  'build|test':
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps: []
`)
    expect(toSvg(workflow, analysis.findings)).toContain('CI &amp; release')
    expect(toMarkdown(workflow, analysis, estimateFootprint(workflow))).toContain(
      '`build\\|test`',
    )
  })

  it('renders a fallback SVG for no jobs', () => {
    const svg = toSvg(
      {
        triggers: { events: [], schedules: [] },
        env: {},
        jobs: [],
      },
      [],
    )
    expect(svg).toContain('No jobs to render')
  })

  it('builds a safe report filename', () => {
    const { workflow } = reportFor(FIXTURE)
    expect(reportFilename(workflow, 'md')).toBe('demo-ci-report.md')
    expect(
      reportFilename({ ...workflow, name: undefined, sourceName: undefined }, 'json'),
    ).toBe('workflow-report.json')
  })

  it('uses the source basename when a workflow has no name', () => {
    const { workflow, analysis } = reportFor(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps: []
`)
    expect(reportFilename(workflow, 'md')).toBe('ci-report.md')
    const report = JSON.parse(
      toJsonReport(workflow, analysis, estimateFootprint(workflow)),
    ) as { name: string }
    expect(report.name).toBe('ci')
  })

  it('parses every bundled sample', () => {
    expect(samples).toHaveLength(3)
    for (const sample of samples) {
      const { workflow } = parseWorkflow(sample.yaml, sample.filename)
      expect(workflow, sample.id).not.toBeNull()
      expect(workflow?.jobs.length, sample.id).toBeGreaterThan(0)
    }
  })

  it('keeps the default sample useful for the demo', () => {
    const { workflow } = parseWorkflow(defaultSample.yaml, defaultSample.filename)
    expect(workflow?.jobs.map((job) => job.id)).toEqual(['preview'])
    const analysis = analyzeWorkflow(workflow!)
    expect(analysis.counts.critical).toBeGreaterThan(0)
    expect(analysis.counts.warning).toBeGreaterThan(0)
  })
})
