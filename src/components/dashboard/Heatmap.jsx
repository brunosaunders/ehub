const MAX_ITEMS = 24

function cellIntensity(value, maxValue) {
  if (!value || maxValue <= 0) return 0
  return Math.max(0.07, Math.sqrt(value / maxValue))
}

export default function Heatmap({
  items = [],
  maxValue = 1,
  colorRgb = '59, 130, 246',
  selectedLabel = null,
  onItemClick,
  countLabel = 'acessos',
}) {
  const displayItems = items.slice(0, MAX_ITEMS)

  if (displayItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-gray-600 text-sm">
        Dados insuficientes para o heatmap
      </div>
    )
  }

  const safeMax = Math.max(1, maxValue)

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {displayItems.map((item, index) => {
          const label = item.label ?? item.miniapp ?? item.journey ?? item.screen ?? `item-${index}`
          const value = Number(item.count || 0)
          const intensity = cellIntensity(value, safeMax)
          const isSelected = selectedLabel === label

          return (
            <button
              key={item.key ?? label}
              type="button"
              className={`relative min-h-[76px] overflow-hidden rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? 'border-white/60 ring-1 ring-white/30'
                  : 'border-gray-800 hover:border-gray-600'
              } ${onItemClick ? 'cursor-pointer' : 'cursor-default'}`}
              style={{
                backgroundColor: value > 0
                  ? `rgba(${colorRgb}, ${isSelected ? Math.min(1, intensity + 0.18) : intensity})`
                  : 'rgba(255,255,255,0.03)',
              }}
              onClick={() => onItemClick?.(item)}
              title={`${label}: ${value.toLocaleString('pt-BR')} ${countLabel}`}
            >
              <span className="absolute right-2 top-2 text-[10px] text-white/45 tabular-nums">
                #{index + 1}
              </span>
              <span className="block truncate pr-6 text-xs font-medium text-white" title={label}>
                {label}
              </span>
              <span className="mt-2 block text-lg font-bold leading-none text-white tabular-nums">
                {value.toLocaleString('pt-BR')}
              </span>
              <span className="mt-1 block truncate text-[10px] text-white/60">
                {countLabel}
                {item.subtitle ? ` · ${item.subtitle}` : ''}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-[10px] text-gray-600">menor</span>
        {[0.07, 0.25, 0.5, 0.75, 1].map((value) => (
          <div
            key={value}
            className="h-2.5 w-4 rounded-sm"
            style={{ backgroundColor: `rgba(${colorRgb}, ${value})` }}
          />
        ))}
        <span className="text-[10px] text-gray-600">maior</span>
      </div>
    </div>
  )
}
