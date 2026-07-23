import { useMemo } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const GROUP_PADDING_X = 20
const GROUP_PADDING_Y = 48
const SCREEN_WIDTH = 180
const SCREEN_HEIGHT = 74
const SCREEN_GAP_X = 18
const SCREEN_GAP_Y = 14
const SCREENS_PER_ROW = 2
const GROUP_GAP_X = 56
const GROUP_GAP_Y = 56
const GROUPS_PER_ROW = 2

function JourneyGroupNode({ data }) {
  return (
    <div className="w-full h-full rounded-2xl border border-dashed border-cyan-700/80 bg-cyan-950/10">
      <div className="px-4 py-3 border-b border-cyan-900/60 bg-cyan-950/30 rounded-t-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/90">
          Jornada
        </p>
        <p className="text-sm font-semibold text-white mt-1 break-words">{data.journey}</p>
        <div className="flex gap-2 mt-2 text-[11px] text-cyan-100/75 flex-wrap">
          <span>{data.totalViews.toLocaleString()} views</span>
          <span>{data.totalSessions.toLocaleString()} sessões</span>
          <span>{data.screenCount.toLocaleString()} telas</span>
        </div>
      </div>
    </div>
  )
}

function ScreenNode({ data }) {
  return (
    <div className="w-full h-full rounded-xl border border-blue-700/80 bg-gray-950/95 shadow-lg shadow-blue-950/20 px-3 py-2.5">
      <p className="text-xs font-semibold text-blue-300 leading-snug break-words line-clamp-2">
        {data.screen}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Visualizações</p>
          <p className="text-lg font-bold text-white leading-none mt-1">
            {data.views.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Usuários</p>
          <p className="text-sm font-semibold text-gray-300 leading-none mt-1">
            {data.userCount.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

const nodeTypes = {
  journeyGroup: JourneyGroupNode,
  screenNode: ScreenNode,
}

function buildGraphElements(miniapp) {
  const nodes = []
  const edges = []

  miniapp.journeys.forEach((journey, journeyIndex) => {
    const screenRows = Math.max(1, Math.ceil(journey.screens.length / SCREENS_PER_ROW))
    const groupWidth = GROUP_PADDING_X * 2 + (SCREEN_WIDTH * SCREENS_PER_ROW) + (SCREEN_GAP_X * (SCREENS_PER_ROW - 1))
    const groupHeight = GROUP_PADDING_Y + 26 + (screenRows * SCREEN_HEIGHT) + (Math.max(0, screenRows - 1) * SCREEN_GAP_Y) + 18
    const groupColumn = journeyIndex % GROUPS_PER_ROW
    const groupRow = Math.floor(journeyIndex / GROUPS_PER_ROW)
    const groupX = groupColumn * (groupWidth + GROUP_GAP_X)
    const groupY = groupRow * (groupHeight + GROUP_GAP_Y)
    const groupId = `journey:${journey.journey}`

    nodes.push({
      id: groupId,
      type: 'journeyGroup',
      position: { x: groupX, y: groupY },
      data: {
        journey: journey.journey,
        totalViews: journey.totalViews,
        totalSessions: journey.totalSessions,
        screenCount: journey.screenCount,
      },
      draggable: false,
      selectable: false,
      style: {
        width: groupWidth,
        height: groupHeight,
        background: 'transparent',
        border: 'none',
      },
    })

    journey.screens.forEach((screen, screenIndex) => {
      const column = screenIndex % SCREENS_PER_ROW
      const row = Math.floor(screenIndex / SCREENS_PER_ROW)
      const screenId = `${groupId}::screen:${screen.screen}`

      nodes.push({
        id: screenId,
        type: 'screenNode',
        parentId: groupId,
        extent: 'parent',
        draggable: false,
        position: {
          x: GROUP_PADDING_X + (column * (SCREEN_WIDTH + SCREEN_GAP_X)),
          y: GROUP_PADDING_Y + (row * (SCREEN_HEIGHT + SCREEN_GAP_Y)),
        },
        style: {
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          border: 'none',
          background: 'transparent',
        },
        data: screen,
      })
    })

    journey.edges.forEach((edge) => {
      const source = `${groupId}::screen:${edge.source}`
      const target = `${groupId}::screen:${edge.target}`
      const strokeWidth = Math.min(6, 1.4 + Math.log2(edge.count + 1))

      edges.push({
        id: `${groupId}::edge:${edge.source}->${edge.target}`,
        source,
        target,
        type: 'smoothstep',
        animated: false,
        label: edge.count > 1 ? `×${edge.count}` : '1',
        labelStyle: { fill: '#94a3b8', fontSize: 11, fontWeight: 600 },
        style: { stroke: '#38bdf8', strokeWidth },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8' },
      })
    })
  })

  return { nodes, edges }
}

export default function HolisticGraph({ miniapp }) {
  const { nodes, edges } = useMemo(() => buildGraphElements(miniapp), [miniapp])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, includeHiddenNodes: false }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.1}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#020617' }}
      >
        <Background color="#0f172a" gap={20} size={1} />
        <Controls style={{ background: '#111827', border: '1px solid #1f2937' }} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => (node.type === 'journeyGroup' ? '#155e75' : '#2563eb')}
          maskColor="rgba(2,6,23,0.78)"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        />
      </ReactFlow>
    </div>
  )
}