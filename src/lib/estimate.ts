import type { Footprint, Workflow } from '../types'

/**
 * Deliberately simple planning numbers, not a bill. GitHub-hosted Linux
 * runners were listed at $0.008/min for private repositories when this was
 * written; public repositories do not consume paid minutes. Users should treat
 * the result as a comparison tool, not an invoice.
 */
export const DEFAULT_MINUTES_PER_JOB = 5
export const DEFAULT_PRICE_PER_MINUTE = 0.008

export function jobInstances(workflow: Workflow): { instances: number; dynamic: boolean } {
  let instances = 0
  let dynamic = false
  for (const job of workflow.jobs) {
    const count = job.matrix?.count
    if (count === null || count === undefined) {
      instances += 1
      if (job.matrix?.dynamic) dynamic = true
    } else {
      instances += count
    }
  }
  return { instances, dynamic }
}

export function estimateFootprint(
  workflow: Workflow,
  minutesPerJob = DEFAULT_MINUTES_PER_JOB,
  pricePerMinute = DEFAULT_PRICE_PER_MINUTE,
): Footprint {
  const { instances, dynamic } = jobInstances(workflow)
  const minutes = instances * minutesPerJob
  return {
    instances,
    dynamic,
    minutes,
    costUsd: minutes * pricePerMinute,
    minutesPerJob,
    pricePerMinute,
  }
}
