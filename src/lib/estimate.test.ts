import { describe, expect, it } from 'vitest'
import { parseWorkflow } from './parse-workflow'
import { estimateFootprint, jobInstances } from './estimate'

function workflowFor(source: string) {
  const { workflow, error } = parseWorkflow(source)
  if (!workflow) throw new Error(error ?? 'fixture did not parse')
  return workflow
}

describe('run footprint', () => {
  it('counts one instance for a normal job and expands a matrix', () => {
    const workflow = workflowFor(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps: []
  b:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22, 24]
    steps: []
`)
    expect(jobInstances(workflow)).toEqual({ instances: 4, dynamic: false })
  })

  it('uses a lower bound for dynamic matrices', () => {
    const workflow = workflowFor(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    strategy:
      matrix: \${{ fromJSON(needs.setup.outputs.matrix) }}
    steps: []
`)
    expect(jobInstances(workflow)).toEqual({ instances: 1, dynamic: true })
  })

  it('estimates minutes and cost with explicit assumptions', () => {
    const workflow = workflowFor(`on: push
jobs:
  a:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps: []
`)
    const footprint = estimateFootprint(workflow, 6, 0.01)
    expect(footprint).toEqual({
      instances: 2,
      dynamic: false,
      minutes: 12,
      costUsd: 0.12,
      minutesPerJob: 6,
      pricePerMinute: 0.01,
    })
  })

  it('supports zero jobs without dividing by zero', () => {
    const footprint = estimateFootprint({
      triggers: { events: [], schedules: [] },
      env: {},
      jobs: [],
    })
    expect(footprint.instances).toBe(0)
    expect(footprint.minutes).toBe(0)
    expect(footprint.costUsd).toBe(0)
  })
})
