import { describe, expect, it } from 'vitest'
import { parseWorkflow } from './parse-workflow'

describe('parseWorkflow', () => {
  it('parses triggers, permissions, env, jobs and steps', () => {
    const { workflow, error } = parseWorkflow(
      `name: CI
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
env:
  NODE_VERSION: 22
  DEBUG: true
jobs:
  test:
    name: Unit tests
    runs-on: ubuntu-latest
    needs: build
    timeout-minutes: 15
    strategy:
      matrix:
        node: [20, 22]
    env:
      CI: "true"
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - name: Test
        run: npm test
        with:
          path: .
        env:
          TOKEN: \${{ secrets.TOKEN }}
  build:
    runs-on: [self-hosted, linux]
    steps: []
`,
      '.github/workflows/ci.yml',
    )

    expect(error).toBeNull()
    expect(workflow?.name).toBe('CI')
    expect(workflow?.sourceName).toBe('.github/workflows/ci.yml')
    expect(workflow?.triggers.events).toEqual(['push', 'pull_request'])
    expect(workflow?.permissions).toEqual({ scopes: { contents: 'read' } })
    expect(workflow?.env).toEqual({ NODE_VERSION: '22', DEBUG: 'true' })

    const test = workflow?.jobs[0]
    expect(test?.id).toBe('test')
    expect(test?.name).toBe('Unit tests')
    expect(test?.needs).toEqual(['build'])
    expect(test?.runsOn).toEqual(['ubuntu-latest'])
    expect(test?.timeoutMinutes).toBe(15)
    expect(test?.matrix?.count).toBe(2)
    expect(test?.env).toEqual({ CI: 'true' })
    expect(test?.steps).toHaveLength(2)
    expect(test?.steps[0]?.uses).toContain('actions/checkout@')
    expect(test?.steps[1]?.name).toBe('Test')
    expect(test?.steps[1]?.with).toEqual({ path: '.' })
    expect(test?.steps[1]?.env).toEqual({ TOKEN: '${{ secrets.TOKEN }}' })

    expect(workflow?.jobs[1]?.runsOn).toEqual(['self-hosted', 'linux'])
    expect(workflow?.jobs[1]?.steps).toEqual([])
  })

  it('parses string triggers and schedule crons', () => {
    expect(parseWorkflow('on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n').workflow?.triggers.events).toEqual([
      'push',
    ])
    const scheduled = parseWorkflow(`on:
  schedule:
    - cron: "0 3 * * *"
    - cron: "30 4 * * 1"
  workflow_dispatch:
jobs:
  a:
    runs-on: ubuntu-latest
`)
    expect(scheduled.workflow?.triggers.events).toEqual(['schedule', 'workflow_dispatch'])
    expect(scheduled.workflow?.triggers.schedules).toEqual([
      '0 3 * * *',
      '30 4 * * 1',
    ])
  })

  it('normalizes read-all, write-all and empty permissions', () => {
    expect(
      parseWorkflow('on: push\npermissions: read-all\njobs:\n  a:\n    runs-on: ubuntu-latest\n')
        .workflow?.permissions,
    ).toEqual({ all: 'read-all', scopes: {} })
    expect(
      parseWorkflow('on: push\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n')
        .workflow?.permissions,
    ).toEqual({ scopes: {} })
  })

  it('parses a reusable workflow job and secrets: inherit', () => {
    const { workflow } = parseWorkflow(`on: push
jobs:
  notify:
    needs: build
    uses: acme/shared/.github/workflows/notify.yml@main
    secrets: inherit
`)
    const job = workflow?.jobs[0]
    expect(job?.uses).toBe('acme/shared/.github/workflows/notify.yml@main')
    expect(job?.secretsInherit).toBe(true)
    expect(job?.runsOn).toEqual([])
  })

  it('parses environment lists and continue-on-error', () => {
    const { workflow } = parseWorkflow(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
        continue-on-error: true
        env:
          - A=1
          - BETA
`)
    expect(workflow?.jobs[0]?.steps[0]?.continueOnError).toBe(true)
    expect(workflow?.jobs[0]?.steps[0]?.env).toEqual({ A: '1', BETA: null })
  })

  it('rejects empty, non-object, invalid and serviceless files', () => {
    expect(parseWorkflow('  ').error).toMatch(/Paste a workflow/)
    expect(parseWorkflow('- one\n- two').error).toMatch(/YAML object/)
    expect(parseWorkflow('on: push\njobs:\n  a: [unclosed').error).toBeTruthy()
    expect(parseWorkflow('on: push').error).toMatch(/No jobs/)
    expect(parseWorkflow('on: push\njobs: {}').error).toMatch(/No jobs/)
    expect(parseWorkflow('on: push\njobs:\n  a: nope').error).toMatch(/must be a YAML object/)
  })

  it('treats a missing on block as no triggers', () => {
    const { workflow, error } = parseWorkflow('jobs:\n  a:\n    runs-on: ubuntu-latest\n')
    expect(error).toBeNull()
    expect(workflow?.triggers.events).toEqual([])
  })
})
