import { useState } from 'react'

const DONUT_COLORS = [
  '#38bdf8',
  '#34d399',
  '#f59e0b',
  '#fb7185',
  '#a78bfa',
  '#22d3ee',
  '#f97316',
  '#84cc16',
  '#e879f9',
  '#facc15',
]

const MAX_SLICES = 8
const DONUT_SIZE = 176
const OUTER_RADIUS = 80
const INNER_RADIUS = 52

function formatCount(value) {
  return Number(value || 0).toLocaleString('pt-BR')
}

function getItemLabel(item) {
  return item.label ?? item.miniapp ?? item.journey ?? item.screen ?? '(sem identificação)'
}

function polarToCartesian(angle, radius) {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: DONUT_SIZE / 2 + radius * Math.cos(radians),
    y: DONUT_SIZE / 2 + radius * Math.sin(radians),
  }
}

function describeDonutSegment(startAngle, endAngle) {
  const outerStart = polarToCartesian(startAngle, OUTER_RADIUS)
  const outerEnd = polarToCartesian(endAngle, OUTER_RADIUS)
  const innerStart = polarToCartesian(startAngle, INNER_RADIUS)
  const innerEnd = polarToCartesian(endAngle, INNER_RADIUS)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

export default function EngagementDonut({ items = [], selectedLabel = null, onItemClick }) {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const rankedItems = items
    .map((item) => ({ ...item, label: getItemLabel(item) }))
    .sort((a, b) => b.count - a.count)
  const visibleItems = rankedItems.slice(0, MAX_SLICES)
  const hiddenCount = rankedItems.slice(MAX_SLICES).reduce((sum, item) => sum + item.count, 0)
  const total = rankedItems.reduce((sum, item) => sum + item.count, 0)
  const donutItems = hiddenCount > 0
    ? [...visibleItems, { label: 'Outros', count: hiddenCount, isOther: true }]
    : visibleItems

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-600">
        Sem dados para proporção
      </div>
    )
  }

  let cursor = 0
  const segments = donutItems.map((item, index) => {
    const startAngle = cursor
    cursor += (item.count / total) * 360
    return {
      ...item,
      index,
      startAngle,
      endAngle: cursor,
      color: item.isOther ? '#475569' : DONUT_COLORS[index % DONUT_COLORS.length],
    }
  })

  const selectedIndex = segments.findIndex((item) => getItemLabel(item) === selectedLabel)
  const hoveredItem = segments[hoveredIndex]
  const focusedIndex = hoveredItem ? hoveredIndex : selectedIndex
  const focusedItem = focusedIndex >= 0 ? segments[focusedIndex] : null
  const focusedPercentage = focusedItem ? (focusedItem.count / total) * 100 : 0

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className="flex items-center justify-center flex-shrink-0 py-2"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <div className="relative w-44 h-44">
          <svg
            viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
            className="w-full h-full overflow-visible"
            role="img"
            aria-label="Proporção de eventos"
          >
            {segments.map((item) => {
              const isFocused = focusedIndex === item.index
              const hasFocus = focusedIndex >= 0

              return (
                <path
                  key={`${getItemLabel(item)}-${item.index}`}
                  d={describeDonutSegment(item.startAngle, item.endAngle)}
                  fill={item.color}
                  className="transition-all duration-150"
                  style={{
                    opacity: hasFocus && !isFocused ? 0.35 : 1,
                    transform: isFocused ? 'scale(1.04)' : 'scale(1)',
                    transformOrigin: 'center',
                    transformBox: 'fill-box',
                    cursor: item.isOther ? 'default' : 'pointer',
                  }}
                  stroke="#030712"
                  strokeWidth="2"
                  onMouseEnter={() => setHoveredIndex(item.index)}
                >
                  <title>
                    {getItemLabel(item)}: {formatCount(item.count)} eventos ({((item.count / total) * 100).toFixed(1)}%)
                  </title>
                </path>
              )
            })}
          </svg>

          <div className="pointer-events-none absolute inset-[18px] rounded-full bg-gray-950 flex flex-col items-center justify-center border border-gray-800 px-2 text-center">
            {focusedItem ? (
              <>
                <span className="max-w-full truncate text-xs font-semibold text-white" title={getItemLabel(focusedItem)}>
                  {getItemLabel(focusedItem)}
                </span>
                <span className="mt-1 text-lg font-bold leading-none text-white tabular-nums">
                  {focusedPercentage.toFixed(1)}%
                </span>
                <span className="mt-1 text-[10px] text-gray-500 tabular-nums">
                  {formatCount(focusedItem.count)} eventos
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold text-white tabular-nums">{formatCount(total)}</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500 mt-1">eventos</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto mt-2 space-y-1.5 pr-1">
        {donutItems.map((item, index) => {
          const percentage = (item.count / total) * 100
          const color = item.isOther ? '#475569' : DONUT_COLORS[index % DONUT_COLORS.length]
          const label = getItemLabel(item)
          const isSelected = selectedLabel === label

          return (
            <button
              key={label}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                isSelected || hoveredIndex === index ? 'bg-gray-800' : 'hover:bg-gray-900'
              } ${item.isOther ? 'cursor-default' : ''}`}
              onClick={() => !item.isOther && onItemClick?.(label)}
              disabled={item.isOther}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
              title={`${label}: ${formatCount(item.count)} eventos`}
            >
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-300 truncate flex-1">{label}</span>
              <span className="text-[10px] text-gray-500 tabular-nums flex-shrink-0">
                {percentage.toFixed(1)}% · {formatCount(item.count)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
