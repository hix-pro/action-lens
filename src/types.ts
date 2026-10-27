import type { Node } from '@xyflow/react'

export type Severity = 'critical' | 'warning' | 'info'

export interface TriggerInfo {
  events: string[]
  schedules: string[]
}

export interface PermissionSet {
  all?: 'read-all' | 'write-all'
  scopes: Record<string, string>
}

export interface MatrixInfo {
  dimensions: Record<string, string[]>
  include: Record<string, string>[]
  exclude: Record<string, string>[]
  dynamic: boolean
  count: number | null
}

export interface Step {
  index: number
  name?: string
  uses?: string
  run?: string
  with: Record<string, string>
  env: Record<string, string | null>
  continueOnError: boolean
}

export interface Job {
  id: string
  name?: string
  needs: string[]
  runsOn: string[]
  steps: Step[]
  env: Record<string, string | null>
  permissions?: PermissionSet
  matrix: MatrixInfo | null
  timeoutMinutes?: number
  uses?: string
  secretsInherit: boolean
  condition?: string
}

export interface Workflow {
  name?: string
  sourceName?: string
  triggers: TriggerInfo
  permissions?: PermissionSet
  env: Record<string, string | null>
  concurrency?: string
  jobs: Job[]
}

export interface Finding {
  id: string
  rule: string
  severity: Severity
  job?: string
  step?: number
  title: string
  detail: string
  fix: string
}

export interface Analysis {
  findings: Finding[]
  counts: Record<Severity, number>
  stats: {
    jobs: number
    steps: number
    actions: number
    instances: number
    dynamicMatrices: number
    triggers: number
  }
}

export interface ParseResult {
  workflow: Workflow | null
  error: string | null
}

export interface Footprint {
  instances: number
  dynamic: boolean
  minutes: number
  costUsd: number
  minutesPerJob: number
  pricePerMinute: number
}

export type JobNodeData = {
  job: Job
  findingCount: number
  criticalCount: number
  warningCount: number
  infoCount: number
}

export type JobNode = Node<JobNodeData, 'job'>
