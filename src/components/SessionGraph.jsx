import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildSessionGraph } from '../utils/dataHelpers'
import EventNode from './EventNode'

const nodeTypes = { eventNode: EventNode }

const H_STEP = 270
const V_STEP = 190
const PER_ROW = 5

export default function SessionGraph({ events }) {
  const { nodes: rawNodes, edges: rawEdges } = useMemo(
    () => buildSessionGraph(events),
    [events],
  )

  const baseNodes = useMemo(
    () =>
      rawNodes.map((node, i) => ({
        id: node.id,
        type: 'eventNode',
        position: { x: (i % PER_ROW) * H_STEP, y: Math.floor(i / PER_ROW) * V_STEP },
        data: { screen: node.screen, events: node.events },
      })),
    [rawNodes],
  )

  const baseEdges = useMemo(
    () =>
      rawEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        animated: false,
        label: edge.count > 1 ? `×${edge.count}` : undefined,
        labelStyle: { fill: '#6b7280', fontSize: 11 },
        style: { stroke: '#3b82f6', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      })),
    [rawEdges],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(baseNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(baseEdges)

  useEffect(() => {
    setNodes(baseNodes)
    setEdges(baseEdges)
  }, [baseNodes, baseEdges, setNodes, setEdges])

  const onNodeClick = useCallback((e) => e.stopPropagation(), [])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        style={{ background: '#030712' }}
      >
        <Background color="#1f2937" gap={20} size={1} />
        <Controls style={{ background: '#111827', border: '1px solid #1f2937' }} />
        <MiniMap
          nodeColor={() => '#3b82f6'}
          maskColor="rgba(0,0,0,0.75)"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        />
      </ReactFlow>
    </div>
  )
}
