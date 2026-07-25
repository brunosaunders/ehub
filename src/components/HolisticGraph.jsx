import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BaseEdge,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
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
const EDGE_STROKE = 1.5
const EDGE_DASH = '5 7'
const EDGE_LANE_STEP = 12
const EDGE_CHANNEL_STEP = 16
const EDGE_CONTROL_W = 40
const EDGE_CONTROL_H = 20
const EDGE_CONTROL_HIT_W = 72
const EDGE_CONTROL_HIT_H = 40
const EDGE_CONTROL_CLEARANCE = EDGE_CONTROL_HIT_W + 24

// ── Node components ───────────────────────────────────────────────────────────

function JourneyGroupNode({ data }) {
  return (
    <div onClick={data.onClick} className="w-full h-full rounded-2xl border border-dashed border-cyan-700/60 bg-cyan-950/8">
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
  const isActive = data.emphasis === 'active'
  const isMuted = data.emphasis === 'muted'

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#38bdf8', width: 8, height: 8, border: '2px solid #0f172a' }}
      />
      <div
        className={`w-full h-full rounded-xl shadow-lg px-3 pt-2.5 pb-2 select-none transition-all ${isActive ? 'ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-slate-950' : ''
          } ${isMuted ? 'opacity-35 saturate-50' : ''
          } ${isEntry
            ? 'border border-gray-700/60 bg-gray-900/90 shadow-gray-950/40'
            : 'border border-blue-700/70 bg-gray-950 shadow-blue-950/30'
          }`}
      >
        <p
          className={`text-xs font-semibold leading-snug line-clamp-2 break-words ${isEntry ? 'text-gray-400' : 'text-blue-200'
            }`}
          title={data.screen}
        >
          {data.screen}
        </p>
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 items-end">
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] text-gray-500">Views</p>
            <p
              className={`text-lg font-bold leading-none mt-0.5 tabular-nums ${isEntry ? 'text-gray-600' : 'text-white'
                }`}
            >
              {isEntry ? '–' : data.views.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.14em] text-gray-500">Usuários</p>
            <p
              className={`text-sm font-semibold leading-none mt-0.5 tabular-nums ${isEntry ? 'text-gray-600' : 'text-gray-300'
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

function EdgeControlNode({ data }) {
  const isActive = data.active
  const isMuted = data.muted

  return (
    <div
      className={`flex h-full w-full cursor-grab select-none items-center justify-center active:cursor-grabbing ${isMuted ? 'opacity-30' : ''
        }`}
      title="Arraste para reposicionar a rota da aresta"
    >
      <div
        className={`flex h-[20px] min-w-[40px] items-center justify-center rounded-full border px-2 text-[10px] font-bold tabular-nums shadow-lg transition-all ${isActive
          ? 'border-cyan-300/90 bg-slate-950/95 text-cyan-200 shadow-cyan-950/60'
          : 'border-slate-700/70 bg-slate-950/78 text-slate-300 shadow-slate-950/50'
          }`}
      >
        {`×${data.count}`}
      </div>
    </div>
  )
}

const nodeTypes = {
  journeyGroup: JourneyGroupNode,
  screenNode: ScreenNode,
  edgeControl: EdgeControlNode,
}

function buildPolylinePath(points) {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ')
}

function getAbsoluteNodePosition(node, nodeById) {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId

  while (parentId) {
    const parent = nodeById.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }

  return { x, y }
}

function getEdgeLaneData(source, target, outgoingBySource, incomingByTarget, orders) {
  const outgoingEdges = outgoingBySource.get(source) ?? []
  const incomingEdges = incomingByTarget.get(target) ?? []
  const sourceIndex = outgoingEdges.findIndex((edge) => edge.source === source && edge.target === target)
  const targetIndex = incomingEdges.findIndex((edge) => edge.source === source && edge.target === target)
  const sourceLane = sourceIndex - (outgoingEdges.length - 1) / 2
  const targetLane = targetIndex - (incomingEdges.length - 1) / 2
  const sourceOrder = orders.get(source) ?? 0
  const targetOrder = orders.get(target) ?? 0

  return {
    sourceLane,
    targetLane,
    verticalLane: Math.max(Math.abs(sourceLane), Math.abs(targetLane)),
    verticalDirection: targetOrder === sourceOrder
      ? (sourceLane + targetLane >= 0 ? 1 : -1)
      : targetOrder > sourceOrder ? 1 : -1,
  }
}

function getHorizontalDirection(position, fallback) {
  if (position === Position.Left) return -1
  if (position === Position.Right) return 1
  return fallback
}

function resolveDefaultControlPoint({ sourceX, sourceY, targetX, targetY, data, sourcePosition, targetPosition }) {
  const sourceLane = Math.abs(data?.sourceLane ?? 0)
  const targetLane = Math.abs(data?.targetLane ?? 0)
  const verticalLane = data?.verticalLane ?? 0
  const direction = data?.verticalDirection ?? (targetY >= sourceY ? 1 : -1)
  const sourceDirection = getHorizontalDirection(sourcePosition, targetX >= sourceX ? 1 : -1)
  const targetDirection = getHorizontalDirection(targetPosition, sourceX <= targetX ? -1 : 1)

  const sourceOutX = sourceX + sourceDirection * (28 + sourceLane * EDGE_LANE_STEP)
  const targetInX = targetX + targetDirection * (28 + targetLane * EDGE_LANE_STEP)
  const nodeHalfHeight = NODE_H / 2
  const corridorOffset = 12 + verticalLane * EDGE_CHANNEL_STEP

  let controlY
  if (direction > 0) {
    const sourceBottom = sourceY + nodeHalfHeight
    const targetTop = targetY - nodeHalfHeight
    const available = targetTop - sourceBottom
    controlY = available > 12
      ? sourceBottom + Math.min(corridorOffset, available / 2)
      : sourceBottom + corridorOffset
  } else {
    const sourceTop = sourceY - nodeHalfHeight
    const targetBottom = targetY + nodeHalfHeight
    const available = sourceTop - targetBottom
    controlY = available > 12
      ? sourceTop - Math.min(corridorOffset, available / 2)
      : sourceTop - corridorOffset
  }

  let controlX = (sourceOutX + targetInX) / 2
  if (sourceDirection === 1 && targetDirection === -1 && sourceOutX > targetInX) {
    controlX = Math.max(sourceOutX, targetX + NODE_W / 2) + 24 + verticalLane * EDGE_CHANNEL_STEP
  } else if (sourceDirection === -1 && targetDirection === 1 && sourceOutX < targetInX) {
    controlX = Math.min(sourceOutX, targetX - NODE_W / 2) - 24 - verticalLane * EDGE_CHANNEL_STEP
  }

  return {
    sourceOutX,
    targetInX,
    controlX,
    controlY,
  }
}

function buildEdgeRoute({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const { sourceOutX, targetInX, controlX, controlY } = data?.controlPoint
    ? {
      sourceOutX: resolveDefaultControlPoint({
        sourceX,
        sourceY,
        targetX,
        targetY,
        data,
        sourcePosition,
        targetPosition,
      }).sourceOutX,
      targetInX: resolveDefaultControlPoint({
        sourceX,
        sourceY,
        targetX,
        targetY,
        data,
        sourcePosition,
        targetPosition,
      }).targetInX,
      controlX: data.controlPoint.x,
      controlY: data.controlPoint.y,
    }
    : resolveDefaultControlPoint({
      sourceX,
      sourceY,
      targetX,
      targetY,
      data,
      sourcePosition,
      targetPosition,
    })

  const points = [
    [sourceX, sourceY],
    [sourceOutX, sourceY],
    [sourceOutX, controlY],
    [controlX, controlY],
    [targetInX, controlY],
    [targetInX, targetY],
    [targetX, targetY],
  ]

  return {
    path: buildPolylinePath(points),
    controlX,
    controlY,
  }
}

function RoutedEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, style }) {
  const { path } = buildEdgeRoute({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  })

  return (
    <BaseEdge path={path} markerEnd={markerEnd} style={style} />
  )
}

const edgeTypes = {
  routed: RoutedEdge,
}

// ── Layered DAG layout ────────────────────────────────────────────────────────
//   1. Kahn's algorithm for rank (longest-path from roots)
//   2. Center each column vertically by view-count order
//   3. Returns {positions, contentWidth, contentHeight}

function computeLayeredLayout(nodeIds, edgeList) {
  if (nodeIds.length === 0) {
    return {
      positions: new Map(),
      contentWidth: NODE_W,
      contentHeight: NODE_H,
      ranks: new Map(),
      orders: new Map(),
    }
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
  const orders = new Map()
  sortedRanks.forEach((r) => {
    const col = sortedRanks.indexOf(r)
    const colNodes = byRank.get(r)
    const colH = colNodes.length * NODE_H + (colNodes.length - 1) * V_GAP
    const startY = Math.max(0, (maxCount * (NODE_H + V_GAP) - V_GAP - colH) / 2)

    colNodes.forEach((id, idx) => {
      orders.set(id, idx)
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
    ranks: rank,
    orders,
  }
}

function ensureInitialStraightEdgeSpace({ positions, edgeList, ranks, orders, outgoingBySource, incomingByTarget }) {
  const adjustedPositions = new Map(
    [...positions.entries()].map(([id, position]) => [id, { ...position }]),
  )

  const sortedEdges = [...edgeList].sort((left, right) => {
    const leftTargetRank = ranks.get(left.target) ?? 0
    const rightTargetRank = ranks.get(right.target) ?? 0
    return leftTargetRank - rightTargetRank
      || (ranks.get(left.source) ?? 0) - (ranks.get(right.source) ?? 0)
      || left.source.localeCompare(right.source)
      || left.target.localeCompare(right.target)
  })

  sortedEdges.forEach(({ source, target }) => {
    const sourceRank = ranks.get(source) ?? 0
    const targetRank = ranks.get(target) ?? 0
    if (targetRank <= sourceRank) return

    const sourcePos = adjustedPositions.get(source)
    const targetPos = adjustedPositions.get(target)
    if (!sourcePos || !targetPos) return

    const laneData = getEdgeLaneData(source, target, outgoingBySource, incomingByTarget, orders)
    const sourceClearance = 28 + Math.abs(laneData.sourceLane) * EDGE_LANE_STEP
    const targetClearance = 28 + Math.abs(laneData.targetLane) * EDGE_LANE_STEP
    const minTargetX = sourcePos.x + NODE_W + sourceClearance + targetClearance + EDGE_CONTROL_CLEARANCE

    if (targetPos.x >= minTargetX) return

    const delta = minTargetX - targetPos.x
    adjustedPositions.forEach((position, nodeId) => {
      if ((ranks.get(nodeId) ?? 0) >= targetRank) {
        position.x += delta
      }
    })
  })

  const maxX = Math.max(...[...adjustedPositions.values()].map((position) => position.x + NODE_W))

  return {
    positions: adjustedPositions,
    contentWidth: Math.max(NODE_W, maxX),
  }
}

function normalizeJourneyGroups(nodes) {
  const nextNodes = nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    style: node.style ? { ...node.style } : undefined,
  }))

  const parents = new Map(nextNodes.filter((node) => node.type === 'journeyGroup').map((node) => [node.id, node]))
  const childrenByParent = new Map()

  nextNodes.forEach((node) => {
    if (!node.parentId || !parents.has(node.parentId)) return
    if (!childrenByParent.has(node.parentId)) {
      childrenByParent.set(node.parentId, [])
    }
    childrenByParent.get(node.parentId).push(node)
  })

  childrenByParent.forEach((children, parentId) => {
    const parent = parents.get(parentId)
    if (!parent || children.length === 0) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    children.forEach((child) => {
      minX = Math.min(minX, child.position.x)
      minY = Math.min(minY, child.position.y)
      maxX = Math.max(maxX, child.position.x + NODE_W)
      maxY = Math.max(maxY, child.position.y + NODE_H)
    })

    const desiredMinX = PAD_X
    const desiredMinY = HEADER_H + PAD_TOP
    const shiftX = minX - desiredMinX
    const shiftY = minY - desiredMinY

    if (shiftX !== 0 || shiftY !== 0) {
      parent.position.x += shiftX
      parent.position.y += shiftY
      children.forEach((child) => {
        child.position.x -= shiftX
        child.position.y -= shiftY
      })
      maxX -= shiftX
      maxY -= shiftY
    }

    parent.style.width = Math.max(PAD_X * 2 + NODE_W, maxX + PAD_X)
    parent.style.height = Math.max(HEADER_H + PAD_TOP + NODE_H + PAD_BOTTOM, maxY + PAD_BOTTOM)
  })

  return nextNodes
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

    const { positions, contentWidth, contentHeight, ranks, orders } = computeLayeredLayout(screenNodeIds, edgeList)

    const outgoingBySource = new Map()
    const incomingByTarget = new Map()
    edgeList.forEach((edge) => {
      if (!outgoingBySource.has(edge.source)) outgoingBySource.set(edge.source, [])
      if (!incomingByTarget.has(edge.target)) incomingByTarget.set(edge.target, [])
      outgoingBySource.get(edge.source).push(edge)
      incomingByTarget.get(edge.target).push(edge)
    })

    const stableSortEdges = (left, right) => {
      const leftTargetRank = ranks.get(left.target) ?? 0
      const rightTargetRank = ranks.get(right.target) ?? 0
      const leftSourceRank = ranks.get(left.source) ?? 0
      const rightSourceRank = ranks.get(right.source) ?? 0
      return leftTargetRank - rightTargetRank
        || (orders.get(left.target) ?? 0) - (orders.get(right.target) ?? 0)
        || leftSourceRank - rightSourceRank
        || (orders.get(left.source) ?? 0) - (orders.get(right.source) ?? 0)
        || left.target.localeCompare(right.target)
    }

    outgoingBySource.forEach((edges) => edges.sort(stableSortEdges))
    incomingByTarget.forEach((edges) => edges.sort(stableSortEdges))

    const initialSpacing = ensureInitialStraightEdgeSpace({
      positions,
      edgeList,
      ranks,
      orders,
      outgoingBySource,
      incomingByTarget,
    })

    const spacedPositions = initialSpacing.positions
    const spacedContentWidth = Math.max(contentWidth, initialSpacing.contentWidth)

    const groupW = PAD_X * 2 + spacedContentWidth
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
      const pos = spacedPositions.get(nodeId) ?? { x: 0, y: 0 }
      rfNodes.push({
        id: nodeId,
        type: 'screenNode',
        parentId: groupId,
        draggable: true,
        position: { x: PAD_X + pos.x, y: HEADER_H + PAD_TOP + pos.y },
        style: { width: NODE_W, height: NODE_H, border: 'none', background: 'transparent' },
        data: screen,
        zIndex: 10,
      })
    })

    // Directed edges with count label
    edgeList.forEach(({ source, target, count }) => {
      const laneData = getEdgeLaneData(source, target, outgoingBySource, incomingByTarget, orders)
      const edgeId = `${groupId}::e::${source}::${target}`
      const controlNodeId = `${groupId}::ctl::${source}::${target}`
      const sourcePos = spacedPositions.get(source) ?? { x: 0, y: 0 }
      const targetPos = spacedPositions.get(target) ?? { x: 0, y: 0 }
      const routeData = {
        count,
        sourceLane: laneData.sourceLane,
        targetLane: laneData.targetLane,
        verticalLane: laneData.verticalLane,
        verticalDirection: laneData.verticalDirection,
      }
      const { controlX, controlY } = buildEdgeRoute({
        sourceX: PAD_X + sourcePos.x + NODE_W,
        sourceY: HEADER_H + PAD_TOP + sourcePos.y + NODE_H / 2,
        targetX: PAD_X + targetPos.x,
        targetY: HEADER_H + PAD_TOP + targetPos.y + NODE_H / 2,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: routeData,
      })

      rfEdges.push({
        id: edgeId,
        source,
        target,
        type: 'routed',
        data: {
          ...routeData,
          controlNodeId,
        },
        style: { stroke: '#38bdf8', strokeWidth: EDGE_STROKE, strokeDasharray: EDGE_DASH },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#38bdf8', width: 14, height: 14 },
        zIndex: 20,
        interactionWidth: 24,
      })

      rfNodes.push({
        id: controlNodeId,
        type: 'edgeControl',
        parentId: groupId,
        draggable: true,
        selectable: true,
        position: {
          x: controlX - EDGE_CONTROL_HIT_W / 2,
          y: controlY - EDGE_CONTROL_HIT_H / 2,
        },
        style: {
          width: EDGE_CONTROL_HIT_W,
          height: EDGE_CONTROL_HIT_H,
          border: 'none',
          background: 'transparent',
        },
        data: {
          edgeId,
          count,
        },
        zIndex: 30,
      })
    })

    groupY += groupH + GROUP_GAP_Y
  })

  return { nodes: rfNodes, edges: rfEdges }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HolisticGraph({ miniapp }) {
  const baseGraph = useMemo(() => buildGraphElements(miniapp), [miniapp])
  const [nodes, setNodes] = useState(() => normalizeJourneyGroups(baseGraph.nodes))
  const [edges, setEdges] = useState(baseGraph.edges)
  const [selectedEdgeId, setSelectedEdgeId] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)

  useEffect(() => {
    setNodes(normalizeJourneyGroups(baseGraph.nodes))
    setEdges(baseGraph.edges)
    setSelectedEdgeId(null)
  }, [baseGraph])

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  )

  const controlPointByEdgeId = useMemo(
    () => new Map(
      nodes
        .filter((node) => node.type === 'edgeControl')
        .map((node) => {
          const absolutePosition = getAbsoluteNodePosition(node, nodeById)
          return [
            node.data.edgeId,
            {
              x: absolutePosition.x + EDGE_CONTROL_HIT_W / 2,
              y: absolutePosition.y + EDGE_CONTROL_HIT_H / 2,
            },
          ]
        }),
    ),
    [nodeById, nodes],
  )

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  )

  const {
    emphasizedNodeIds,
    emphasizedEdgeIds,
  } = useMemo(() => {
    if (selectedNodeId) {
      const nodeIds = new Set([selectedNodeId])
      const edgeIds = new Set()

      edges.forEach((edge) => {
        if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
          edgeIds.add(edge.id)
          nodeIds.add(edge.source)
          nodeIds.add(edge.target)
        }
      })

      return {
        emphasizedNodeIds: nodeIds,
        emphasizedEdgeIds: edgeIds,
      }
    }

    if (selectedEdgeId) {
      const edge = edges.find((e) => e.id === selectedEdgeId)

      if (!edge) {
        return {
          emphasizedNodeIds: null,
          emphasizedEdgeIds: null,
        }
      }

      return {
        emphasizedNodeIds: new Set([edge.source, edge.target]),
        emphasizedEdgeIds: new Set([edge.id]),
      }
    }

    return {
      emphasizedNodeIds: null,
      emphasizedEdgeIds: null,
    }
  }, [selectedNodeId, selectedEdgeId, edges])

  const journeyHasEmphasis = useMemo(() => {
    if (!emphasizedNodeIds) return null
    const emphasisByJourney = new Map()
    nodes.forEach((node) => {
      if (node.type !== 'screenNode' || !node.parentId) return
      if (emphasizedNodeIds.has(node.id)) {
        emphasisByJourney.set(node.parentId, true)
      }
    })
    return emphasisByJourney
  }, [nodes, emphasizedNodeIds])

  const displayNodes = useMemo(
    () => nodes.map((node) => {
      const style = node.style ? { ...node.style } : undefined
      const hasSelection =
        selectedEdgeId !== null ||
        selectedNodeId !== null

      if (node.type === 'screenNode') {
        const emphasis = !hasSelection
          ? 'default'
          : emphasizedNodeIds.has(node.id)
            ? 'active'
            : 'muted'

        if (style) {
          style.opacity = emphasis === 'muted' ? 0.28 : 1
        }

        return {
          ...node,
          style,
          zIndex: emphasis === 'active' ? 40 : node.zIndex,
          data: {
            ...node.data,
            emphasis,
          },
        }
      }

      if (node.type === 'edgeControl') {
        const isActive = emphasizedEdgeIds
          ? emphasizedEdgeIds.has(node.data.edgeId)
          : false

        const hasSelection =
          selectedEdgeId !== null || selectedNodeId !== null

        const isMuted =
          hasSelection && !isActive
        if (style) {
          style.opacity = isMuted ? 0.25 : 1
        }

        return {
          ...node,
          style,
          zIndex: isActive ? 45 : node.zIndex,
          data: {
            ...node.data,
            active: isActive,
            muted: isMuted,
          },
        }
      }

      if (node.type === 'journeyGroup' && style) {
        style.opacity = journeyHasEmphasis && !journeyHasEmphasis.get(node.id) ? 0.35 : 1
      }

      return {
        ...node,
        style,
      }
    }),
    [nodes, emphasizedNodeIds, journeyHasEmphasis, selectedEdgeId],
  )

  const displayEdges = useMemo(
    () => edges.map((edge) => {
      const isActive = emphasizedEdgeIds
        ? emphasizedEdgeIds.has(edge.id)
        : false

      const hasSelection =
        selectedEdgeId !== null || selectedNodeId !== null

      const isMuted =
        hasSelection && !isActive

      return {
        ...edge,
        zIndex: isActive ? 50 : edge.zIndex,
        data: {
          ...edge.data,
          controlPoint: controlPointByEdgeId.get(edge.id),
        },
        style: {
          ...edge.style,
          opacity: isMuted ? 0.18 : 1,
          stroke: isActive ? '#7dd3fc' : '#38bdf8',
        },
      }
    }),
    [edges, controlPointByEdgeId, selectedEdgeId],
  )

  const onNodesChange = useCallback((changes) => {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes))
  }, [])

  const onNodeDragStop = useCallback((_event, node) => {
    if (node.type === 'journeyGroup') return
    setNodes((currentNodes) => normalizeJourneyGroups(currentNodes))
  }, [])

  const onEdgeClick = useCallback((_event, edge) => {
    setSelectedNodeId(null)
    setSelectedEdgeId(edge.id)
  }, [])

  const onNodeClick = useCallback((_event, node) => {
    if (node.type === 'journeyGroup') {
      setSelectedEdgeId(null)
      setSelectedNodeId(null)
      return
    }
    
    if (node.type === 'edgeControl') {
      setSelectedNodeId(null)
      setSelectedEdgeId(node.data.edgeId)
      return
    }

    if (node.type !== 'screenNode') {
      return
    }

    setSelectedEdgeId(null)
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedEdgeId(null)
    setSelectedNodeId(null)
  }, [])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable
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
