import { ChevronRight } from 'lucide-react'

export default function DrilldownPanel({
  items = [],
  maxCount = 1,
  breadcrumb = [],
  onItemClick,
  countLabel = 'eventos',
  colorClass = 'bg-blue-600',
  renderItemExtra = null,
}) {
  const safeMax = Math.max(1, maxCount)

  return (
    <div className="flex flex-col h-full min-h-0">
      {breadcrumb.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3 flex-shrink-0">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={11} className="text-gray-700" />}
              <button
                className={`text-xs transition-colors ${
                  i === breadcrumb.length - 1
                    ? 'text-white font-medium cursor-default'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={crumb.onClick}
                disabled={i === breadcrumb.length - 1}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-600 text-sm">
          Sem dados para exibir
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto space-y-1.5 pr-1">
          {items.map((item, i) => {
            const name = item.miniapp ?? item.journey ?? item.screen ?? `item-${i}`
            const pct = (item.count / safeMax) * 100
            const isLeaf = item.screen !== undefined

            return (
              <button
                key={name}
                className={`w-full text-left rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5 transition-colors group ${
                  isLeaf ? 'cursor-default' : 'hover:border-gray-600 hover:bg-gray-900'
                }`}
                onClick={() => !isLeaf && onItemClick?.(name)}
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <span className="text-sm text-gray-200 truncate flex-1 min-w-0 group-hover:text-white transition-colors">
                    {i + 1}. {name}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                    {item.count.toLocaleString('pt-BR')} {countLabel}
                  </span>
                </div>

                <div className="h-1 rounded-full bg-gray-800">
                  <div
                    className={`h-full rounded-full ${colorClass} opacity-80 transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-1.5 gap-2">
                  <span className="text-[10px] text-gray-600 tabular-nums">
                    {item.users.toLocaleString('pt-BR')} usuário{item.users !== 1 ? 's' : ''}
                  </span>
                  {renderItemExtra && (
                    <div className="flex-shrink-0 min-w-0">
                      {renderItemExtra(item)}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
