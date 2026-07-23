export default function CSVPreview({ headers, data, fileName }) {
  const preview = data.slice(0, 10)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-white">{fileName}</h3>
        <span className="text-sm text-gray-500">
          {data.length.toLocaleString()} linhas · {headers.length} colunas
        </span>
      </div>

      <div className="overflow-auto rounded-xl border border-gray-800 max-h-80">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="sticky top-0 bg-gray-900 border-b border-gray-800">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-xs font-medium text-gray-400 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-gray-900 ${i % 2 === 0 ? 'bg-transparent' : 'bg-gray-900/20'}`}
              >
                {headers.map((h) => (
                  <td
                    key={h}
                    className="px-3 py-1.5 text-gray-300 whitespace-nowrap max-w-xs truncate"
                  >
                    {String(row[h] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600 mt-2">
        Exibindo {Math.min(10, data.length)} de {data.length.toLocaleString()} linhas
      </p>
    </div>
  )
}
