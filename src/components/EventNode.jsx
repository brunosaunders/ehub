import { memo, useState, useCallback } from 'react'
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react'
import { formatTimestamp } from '../utils/dataHelpers'
import { useStore } from '../store/useStore'

const EventNode = memo(function EventNode({ id, data }) {
  const updateNodeInternals = useUpdateNodeInternals()
  const [isOpen, setIsOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState(null)
  const { primaryColumns, secondaryColumns, keyEvents } = useStore()
  const { screen, events } = data

  const toggleOpen = useCallback(
    (e) => {
      e.stopPropagation()
      setIsOpen((v) => {
        const next = !v
        setTimeout(() => updateNodeInternals(id), 20)
        if (next) setIsHovered(false)
        else setExpandedIdx(null)
        return next
      })
    },
    [id, updateNodeInternals],
  )

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#3b82f6', width: 8, height: 8, border: 'none' }}
      />

      <div
        className={`rounded-xl border bg-gray-900 transition-all duration-150 overflow-hidden cursor-pointer select-none ${
          isOpen
            ? 'border-blue-500 shadow-lg shadow-blue-500/20 w-72'
            : isHovered
              ? 'border-blue-700 w-52'
              : 'border-gray-700 w-44'
        }`}
        onMouseEnter={() => !isOpen && setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={toggleOpen}
      >
        {/* Header – always visible */}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-blue-300 leading-snug break-words">
                {screen}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {events.length} evento{events.length !== 1 ? 's' : ''}
              </p>
            </div>
            <span className="text-gray-600 text-xs flex-shrink-0 mt-0.5">
              {isOpen ? '✕' : '↗'}
            </span>
          </div>
        </div>

        {/* Hover preview */}
        {isHovered && !isOpen && (
          <div className="border-t border-gray-800 px-3 pb-2.5 pt-1.5">
            {events.slice(0, 5).map((ev, i) => (
              <p
                key={i}
                className={`text-xs truncate py-0.5 ${
                  keyEvents.includes(ev.event_name) ? 'text-blue-400' : 'text-gray-500'
                }`}
              >
                {ev.event_name || '–'}
              </p>
            ))}
            {events.length > 5 && (
              <p className="text-xs text-gray-600 py-0.5">+{events.length - 5} mais</p>
            )}
          </div>
        )}

        {/* Expanded detail */}
        {isOpen && (
          <div className="border-t border-gray-800 max-h-96 overflow-y-auto">
            <div className="p-2 space-y-1">
              {events.map((ev, i) => (
                <div key={i}>
                  <button
                    className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
                      expandedIdx === i
                        ? 'bg-blue-900/40 border border-blue-800/50'
                        : 'bg-gray-800/60 hover:bg-gray-800'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedIdx(expandedIdx === i ? null : i)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-medium ${
                          keyEvents.includes(ev.event_name) ? 'text-blue-400' : 'text-gray-300'
                        }`}
                      >
                        {ev.event_name || '(sem tipo)'}
                      </span>
                      <span className="text-gray-600 text-[10px]">
                        {expandedIdx === i ? '▲' : '▼'}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5 truncate">
                      {formatTimestamp(ev.app_timestamp)}
                    </p>
                  </button>

                  {expandedIdx === i && (
                    <div
                      className="ml-2 mt-1 bg-gray-950 border border-gray-800 rounded-lg p-2 space-y-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Principais
                      </p>
                      {primaryColumns.map((col) =>
                        ev[col] != null && ev[col] !== '' ? (
                          <div key={col} className="flex gap-1 min-w-0">
                            <span className="text-[10px] text-blue-400 font-medium flex-shrink-0">
                              {col}:
                            </span>
                            <span className="text-[10px] text-gray-300 break-all">
                              {String(ev[col])}
                            </span>
                          </div>
                        ) : null,
                      )}

                      {secondaryColumns.some((c) => ev[c] != null && ev[c] !== '') && (
                        <>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1.5 pt-1.5 border-t border-gray-800">
                            Secundárias
                          </p>
                          {secondaryColumns.map((col) =>
                            ev[col] != null && ev[col] !== '' ? (
                              <div key={col} className="flex gap-1 min-w-0">
                                <span className="text-[10px] text-purple-400 font-medium flex-shrink-0">
                                  {col}:
                                </span>
                                <span className="text-[10px] text-gray-300 break-all">
                                  {String(ev[col])}
                                </span>
                              </div>
                            ) : null,
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#3b82f6', width: 8, height: 8, border: 'none' }}
      />
    </>
  )
})

export default EventNode
