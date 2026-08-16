function fmtMs(value) {
  if (value === null || value === undefined) return '–'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

export default function DurationStats({ stats }) {
  if (!stats || stats.p50 === null) {
    return <span className="text-[10px] text-gray-600">sem dados de duração</span>
  }

  return (
    <div className="flex gap-2.5 text-[10px]">
      <span className="text-gray-500">
        p50 <span className="text-gray-300">{fmtMs(stats.p50)}</span>
      </span>
      <span className="text-gray-500">
        p95 <span className="text-gray-300">{fmtMs(stats.p95)}</span>
      </span>
      <span className="text-gray-500">
        p99 <span className="text-gray-300">{fmtMs(stats.p99)}</span>
      </span>
    </div>
  )
}
