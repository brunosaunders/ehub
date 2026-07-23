import { useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W = 192
const NODE_H = 84
const H_GAP = 64   // horizontal gap between DAG layers
const V_GAP = 24   // vertical gap between nodes in the same layer
const HEADER_H = 82
const PAD_X = 28
const PAD_TOP = 14
const PAD_BOTTOM = 24
const GROUP_GAP_Y = 60

// ── Node components ───────────────────────────────────────────────────────────

function JourneyGroupNode({ data }) {
  return (
    <div className="w-full h-full rounded-2xl border border-dashed border-cyan-700/60 bg-cyan-950/8 pointer-events-none">
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-500/80">
          Jornada
        </p>
        <p className="text-sm font-bold text-white mt-0.5 break-words leading-snug">
          {data.journey}
        </p>
        <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-cyan-200/55">
          <span>{data.totalViews.toLocaleString()} views</span>
          <span>·</span>
          <span>{data.totalSessions.toLocaleString()} sessões</span>
          <span>·</span>
          <span>{data.screenCount.toLocaleString()} tela{data.screenCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}

function ScreenNode({ data }) {
  const isEntry = data.views === 0   // came only as a referrer, never as a primary target
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#38bdf8', width: 8, height: 8, border: '2px solid #0f172a' }}
      />
      <div
        className={`w-full h-full rounded-xl shadow-lg px-3 pt-2.5 pb-2 select-none ${
          isEntry
            ? 'border border-gray-700/60 bg-gray-900/90 shadow-gray-950/40'
            : 'border border-blue-700/70 bg-gray-950 shadow-blue-950/30'
        }`}
      >
        <p
          className={`text-xs font-semibold leading-snug line-clamp-2 break-words ${
            isEntry ? 'text-gray-400' : 'text-blue-200'
          }`}
          title={data.screen}
        >
          {data.screen}
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 items-end">
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-gray-500">Views</p>
            <p
              className={`text-lg font-bold leading-none mt-0.5 tabular-nums ${
                isEntry ? 'text-gray-600' : 'text-white'
              }`}
            >
              {isEntry ? '–' : data.views.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.14em] text-gray-500">Usuários</p>
            <p
              className={`text-sm font-semibold leading-none mt-0.5 tabular-nums ${
                isEntry ? 'text-gray-600' : 'text-gray-300'
              }`}
            >
              {isEntry ? '–' : data.userCount.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#38bdf8', width: 8, height: 8, border: '2px solid #0f172a' }}
      />
    </>
  )
}

const nodeTypes = {
  journeyGroup: JourneyGroupNode,
  screenNode: ScreenNode,
}

// ── Layered DAG layout ────────────────────────────────────────────────────────
//   1. Kahn's algorithm for rank (longest-path from roots)
//   2. Center each column vertically by view-count order
//   3. Returns {positions, contentWidth, contentHeight}

function computeLayeredLayout(nodeIds, edgeList) {
  if (nodeIds.length === 0) {
    return { positions: new Map(), contentWidth: NODE_W, contentHeight: NODE_H }
  }

  const outAdj = new Map()
  const inDeg = new Map()
  nodeIds.forEach((id) => { outAdj.set(id, []); inDeg.set(id, 0) })

  const validSet = new Set(nodeIds)
  edgeList.forEach(({ source, target }) => {
    if (!validSet.has(source) || !validSet.has(target) || source === target) return
    outAdj.get(source).push(target)
    inDeg.set(target, inDeg.get(target) + 1)
  })

  // Rank assignment via BFS (longest path from sources)
  const rank = new Map()
  nodeIds.forEach((id) => rank.set(id, 0))

  const queue = nodeIds.filter((id) => inDeg.get(id) === 0)
  const visited = new Set(queue)

  while (queue.length > 0) {
    const id = queue.shift()
    const r = rank.get(id)
    outAdj.get(id).forEach((tgt) => {
      if (r + 1 > rank.get(tgt)) rank.set(tgt, r + 1)
      inDeg.set(tgt, inDeg.get(tgt) - 1)
      if (inDeg.get(tgt) <= 0 && !visited.has(tgt)) {
        visited.add(tgt)
        queue.push(tgt)
      }
    })
  }

  // Group by rank
  const byRank = new Map()
  rank.forEach((r, id) => {
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r).push(id)
  })

  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b)
  const maxCount = Math.max(...sortedRanks.map((r) => byRank.get(r).length))

  const positions = new Map()
  sortedRanks.forEach((r) => {
    const col = sortedRanks.indexOf(r)
    const colNodes = byRank.get(r)
    const colH = colNodes.length * NODE_H + (colNodes.length - 1) * V_GAP
    const startY = Math.max(0, (maxCount * (NODE_H + V_GAP) - V_GAP - colH) / 2)

    colNodes.forEach((id, idx) => {
      positions.set(id, { x: col * (NODE_W + H_GAP), y: startY + idx * (NODE_H + V_GAP) })
    })
  })

  const numCols = sortedRanks.length
  const contentWidth = numCols * NODE_W + Math.max(0, numCols - 1) * H_GAP
  const contentHeight = maxCount * NODE_H + Math.max(0, maxCount - 1) * V_GAP

  return {
    positions,
    contentWidth: Math.max(contentWidth, NODE_W),
    contentHeight: Math.max(contentHeight, NODE_H),
  }
}

// ── Graph elements builder ────────────────────────────────────────────────────

function buildGraphElements(miniapp) {
  const rfNodes = []
  const rfEdges = []
  let groupY = 0

  miniapp.journeys.forEach((journey) => {
    const groupId = `grp::${journey.journey}`
    const screenId = (screen) => `${groupId}::scr::${screen}`

    const screenNodeIds = journey.screens.map((s) => screenId(s.screen))
    const screenByNodeId = new Map(journey.screens.map((s) => [screenId(s.screen), s]))
    const validSet = new Set(screenNodeIds)

    const edgeList = journey.edges
      .map((e) => ({ source: screenId(e.source), target: screenId(e.target), count: e.count }))
      .filter((e) => validSet.has(e.source) && validSet.has(e.target) && e.source !== e.target)

    if (screenNodeIds.length === 0) return

    const { positions, contentWidth, contentHeight } = computeLayeredLayout(screenNodeIds, edgeList)

    const groupW = PAD_X * 2 + contentWidth
    const groupH = HEADER_H + PAD_TOP + contentHeight + PAD_BOTTOM

    // Journey group background node
    rfNodes.push({
      id: groupId,
      type: 'journeyGroup',
      position: { x: 0, y: groupY },
      data: {
        journey: journey.journey,
        totalViews: journey.totalViews,
        totalSessions: journey.totalSessions,
        screenCount: journey.screenCount,
      },
      draggable: false,
      selectable: false,
      style: { width: groupW, height: groupH, background: 'transparent', border: 'none' },
      zIndex: 0,
    })

    // Screen nodes (children of the group)
    screenNodeIds.forEach((nodeId) => {
      const screen = screenByNodeId.get(nodeId)
      const pos = positions.get(nodeId) ?? { x: 0, y: 0 }
      rfNodes.push({
        id: nodeId,
        type: 'screenNode',
        parentId: groupId,
        extent: 'parent',
        draggable: false,
        position: { x: PAD_X + pos.x, y: HEADER_H + PAD_TOP + pos.y },
        style: { width: NODE_W, height: NODE_H, border: 'none', background: 'transparent' },
        data: screen,
        zIndex: 10,
      })
    })

    // Directed edges with count label
    edgeList.forEach(({ source, target, count }) => {
      const strokeWidth = Math.min(7, 1.5 + Math.log2(count + 1))
      rfEdges.push({
        id: `${groupId}::e::${source}::${target}`,
        source,
        target,
        type: 'smoothstep',
        label: `×${count}`,
        labelBgStyle: { fill: '#0c1322', fillOpacity: 0.9, rx: 4, ry: 4 },
        labelStyle: { fill: '#94a3b8', fontSize: 11, fontWeight: 700 },
        style: { stroke: '#38bdf8', strokeWidth },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8', width: 14, height: 14 },
        zIndex: 20,
      })
    })

    groupY += groupH + GROUP_GAP_Y
  })

  return { nodes: rfNodes, edges: rfEdges }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HolisticGraph({ miniapp }) {
  const { nodes, edges } = useMemo(() => buildGraphElements(miniapp), [miniapp])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#020617' }}
      >
        <Background color="#0f172a" gap={24} size={1} />
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
