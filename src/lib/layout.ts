import dagre from '@dagrejs/dagre'
import type { Edge } from '@xyflow/react'
import type { Finding, JobNode, Workflow } from '../types'

export const JOB_NODE_WIDTH = 280
export const JOB_NODE_HEIGHT = 154

export interface JobGraph {
  nodes: JobNode[]
  edges: Edge[]
}

export function buildJobGraph(workflow: Workflow, findings: Finding[]): JobGraph {
  const ids = new Set(workflow.jobs.map((job) => job.id))
  const graph = new dagre.graphlib.Graph()

  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 46,
    ranksep: 76,
    marginx: 20,
    marginy: 20,
  })

  for (const job of workflow.jobs) {
    graph.setNode(job.id, { width: JOB_NODE_WIDTH, height: JOB_NODE_HEIGHT })
  }

  const edges: Edge[] = []
  for (const job of workflow.jobs) {
    for (const dependency of job.needs) {
      if (!ids.has(dependency)) continue
      graph.setEdge(job.id, dependency)
      edges.push({
        id: `${job.id}->${dependency}`,
        source: job.id,
        target: dependency,
        type: 'smoothstep',
        style: { stroke: 'rgba(90, 169, 255, 0.4)', strokeWidth: 1.5 },
      })
    }
  }

  dagre.layout(graph)

  const nodes: JobNode[] = workflow.jobs.map((job) => {
    const position = graph.node(job.id) as { x: number; y: number }
    const jobFindings = findings.filter((finding) => finding.job === job.id)
    return {
      id: job.id,
      type: 'job',
      position: {
        x: position.x - JOB_NODE_WIDTH / 2,
        y: position.y - JOB_NODE_HEIGHT / 2,
      },
      data: {
        job,
        findingCount: jobFindings.length,
        criticalCount: jobFindings.filter(
          (finding) => finding.severity === 'critical',
        ).length,
        warningCount: jobFindings.filter(
          (finding) => finding.severity === 'warning',
        ).length,
        infoCount: jobFindings.filter((finding) => finding.severity === 'info')
          .length,
      },
    }
  })

  return { nodes, edges }
}
