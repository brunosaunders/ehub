export default function ColumnMapper({ csvHeaders, mapping, onChange, primaryColumns, secondaryColumns }) {
  const groups = [
    { label: 'Principais', cols: primaryColumns, badge: 'bg-blue-900 text-blue-300' },
    { label: 'Secundárias', cols: secondaryColumns, badge: 'bg-purple-900 text-purple-300' },
  ]

  const handleChange = (expectedCol, value) => {
    onChange({ ...mapping, [expectedCol]: value })
  }

  const matched = Object.values(mapping).filter(Boolean).length
  const total = primaryColumns.length + secondaryColumns.length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">Mapeamento de Colunas</h3>
        <span className="text-sm text-gray-500">
          {matched}/{total} mapeadas
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Associe cada coluna esperada à coluna correspondente no seu CSV. Colunas com o mesmo nome
        são detectadas automaticamente.
      </p>

      {groups.map(({ label, cols, badge }) => (
        <div key={label} className="mb-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {label}
          </h4>
          <div className="space-y-2">
            {cols.map((col) => (
              <div
                key={col}
                className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 w-48 flex-shrink-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${badge}`}>{label.slice(0, 3)}</span>
                  <span className="text-sm text-white font-medium truncate">{col}</span>
                </div>
                <span className="text-gray-600 text-sm">→</span>
                <select
                  className="flex-1 bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
                  value={mapping[col] || ''}
                  onChange={(e) => handleChange(col, e.target.value)}
                >
                  <option value="">— não mapeado —</option>
                  {csvHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {mapping[col] && (
                  <span className="text-green-500 text-sm flex-shrink-0">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
