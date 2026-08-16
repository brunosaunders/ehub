function getCodeStyle(code) {
  const n = parseInt(code, 10)
  if (n >= 200 && n < 300) return 'bg-green-900/40 text-green-300 border-green-700/40'
  if (n >= 300 && n < 400) return 'bg-blue-900/40 text-blue-300 border-blue-700/40'
  if (n >= 400 && n < 500) return 'bg-amber-900/40 text-amber-300 border-amber-700/40'
  if (n >= 500) return 'bg-red-900/40 text-red-300 border-red-700/40'
  return 'bg-gray-800 text-gray-400 border-gray-700/60'
}

export default function StatusBadges({ codes = [], max = 4 }) {
  if (!codes || codes.length === 0) return null

  const visible = codes.slice(0, max)
  const overflow = codes.length - max

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(({ code, count }) => (
        <span
          key={code}
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${getCodeStyle(code)}`}
          title={`HTTP ${code}: ${count.toLocaleString('pt-BR')} ocorrência(s)`}
        >
          {code} · {count}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-gray-600">+{overflow}</span>
      )}
    </div>
  )
}
