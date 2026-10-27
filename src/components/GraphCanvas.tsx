import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import { useEffect, useMemo, useRef } from 'react'
import type { Finding, JobNode, JobNodeData, Workflow } from '../types'
import { buildJobGraph } from '../lib/layout'
import { JobNodeCard } from './JobNode'

const nodeTypes = {
  job: JobNodeCard,
} satisfies NodeTypes

interface GraphCanvasProps {
  workflow: Workflow
  findings: Finding[]
  selectedJob: string | null
  onSelectJob: (id: string | null) => void
}

function severityColor(data: JobNodeData): string {
  if (data.criticalCount > 0) return '#ff6b6b'
  if (data.warningCount > 0) return '#ffb454'
  if (data.infoCount > 0) return '#7dd3fc'
  return '#5aa9ff'
}

function Flow({ workflow, findings, selectedJob, onSelectJob }: GraphCanvasProps) {
  const graph = useMemo(() => buildJobGraph(workflow, findings), [workflow, findings])
  const [nodes, setNodes, onNodesChange] = useNodesState<JobNode>(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(graph.edges)
  const { fitView } = useReactFlow()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void fitView({ padding: 0.08, duration: 260, minZoom: 0.7, maxZoom: 1 })
    }, 60)
    return () => window.clearTimeout(timer.current)
  }, [graph, setNodes, setEdges, fitView])

  const visibleNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.selected === (node.id === selectedJob)
          ? node
          : { ...node, selected: node.id === selectedJob },
      ),
    [nodes, selectedJob],
  )

  return (
    <ReactFlow
      nodes={visibleNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelectJob(node.id)}
      onPaneClick={() => onSelectJob(null)}
      fitView
      fitViewOptions={{ padding: 0.08, minZoom: 0.7, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={1.8}
      proOptions={{ hideAttribution: false }}
      className="action-flow"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#172433" />
      <Controls position="bottom-left" showInteractive={false} aria-label="Graph controls" />
      {workflow.jobs.length > 6 && (
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          aria-label="Graph minimap"
          style={{ width: 132, height: 86, marginBottom: 20 }}
          maskColor="rgba(4, 7, 11, 0.72)"
          nodeStrokeWidth={2}
          nodeColor={(node: Node) => severityColor((node as JobNode).data)}
          nodeClassName="action-minimap-node"
        />
      )}
    </ReactFlow>
  )
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  )
}
