import { useState, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table'
import { useStore } from '../store/useStore'
import { getFilesData } from '../utils/db'
import { applyMapping } from '../utils/dataHelpers'
import { ChevronLeft, ChevronRight, Filter, X } from 'lucide-react'

const PAGE_SIZE = 100
const SAFE_TABLE_MAX_ROWS = 50000
const LARGE_SELECTION_ROW_THRESHOLD = 500000
const LARGE_SELECTION_ESTIMATED_BYTES = 250 * 1024 * 1024

export default function DataTablePage() {
  const { files, selectedFileIds, primaryColumns, secondaryColumns, tableColumnOrder } = useStore()
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(false)
  const [isPartialLoad, setIsPartialLoad] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState([])
  const [showFilters, setShowFilters] = useState(false)
  const [showAllCols, setShowAllCols] = useState(false)

  const selectedFiles = files.filter((file) => selectedFileIds.includes(file.id))
  const totalSelectedRows = selectedFiles.reduce((sum, file) => sum + Number(file.rowCount || 0), 0)
  const totalSelectedEstimatedBytes = selectedFiles.reduce(
    (sum, file) => sum + Number(file.estimatedBytes || 0),
    0,
  )
  const shouldUseSafeMode =
    totalSelectedRows >= LARGE_SELECTION_ROW_THRESHOLD ||
    totalSelectedEstimatedBytes >= LARGE_SELECTION_ESTIMATED_BYTES

  useEffect(() => {
    if (selectedFileIds.length === 0) { setAllData([]); return }
    setLoading(true)
    getFilesData(
      selectedFileIds,
      shouldUseSafeMode ? { maxRows: SAFE_TABLE_MAX_ROWS } : undefined,
    ).then((filesData) => {
      const merged = filesData.flatMap((fd) => {
        const meta = files.find((f) => f.id === fd.id)
        return applyMapping(fd.data, meta?.mapping).map((r) => ({
          ...r,
          _source: meta?.name ?? fd.id,
        }))
      })
      setAllData(merged)
      setIsPartialLoad(shouldUseSafeMode || filesData.some((file) => file.isPartial))
      setLoading(false)
    })
  }, [selectedFileIds, files, shouldUseSafeMode])

  const columns = useMemo(() => {
    if (allData.length === 0) return []
    const allKeys = new Set()
    allData.slice(0, 200).forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)))

    const configuredColumns = tableColumnOrder.filter((column) => allKeys.has(column))
    const others = [...allKeys].filter(
      (k) => !k.startsWith('_') && !configuredColumns.includes(k),
    )

    const ordered = showAllCols
      ? ['_source', ...configuredColumns, ...others]
      : ['_source', ...configuredColumns]

    return ordered.map((col) => ({
      accessorKey: col,
      header: col,
      cell: (info) => {
        const v = info.getValue()
        return v != null ? String(v) : ''
      },
    }))
  }, [allData, tableColumnOrder, showAllCols])

  const table = useReactTable({
    data: allData,
    columns,
    state: { globalFilter, columnFilters },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  })

  const clearAllFilters = () => {
    setGlobalFilter('')
    setColumnFilters([])
  }

  const hasFilters = globalFilter !== '' || columnFilters.length > 0

  if (selectedFileIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-4">📊</div>
          <p className="text-lg">Nenhum arquivo selecionado</p>
          <p className="text-sm mt-1">Selecione arquivos na página Arquivos</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold text-white">
          Dados
          {!loading && (
            <span className="text-base text-gray-500 ml-3 font-normal">
              {table.getFilteredRowModel().rows.length.toLocaleString()} /{' '}
              {allData.length.toLocaleString()} registros
            </span>
          )}
        </h1>
        <div className="flex gap-2">
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              showFilters ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter size={14} />
            Filtros{hasFilters ? ' ●' : ''}
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              showAllCols
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
            onClick={() => setShowAllCols((v) => !v)}
          >
            {showAllCols ? 'Menos colunas' : 'Todas as colunas'}
          </button>
        </div>
      </div>

      {isPartialLoad && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          Dataset grande detectado. A tabela carregou apenas os primeiros {SAFE_TABLE_MAX_ROWS.toLocaleString('pt-BR')} registros para manter o navegador estável.
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-gray-900 rounded-xl p-4 flex-shrink-0 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Pesquisa global em todos os campos..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            {hasFilters && (
              <button
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-400 transition-colors"
                onClick={clearAllFilters}
              >
                <X size={14} /> Limpar
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {primaryColumns.map((col) => {
              const column = table.getColumn(col)
              if (!column) return null
              return (
                <div key={col}>
                  <p className="text-[10px] text-gray-500 mb-1 truncate uppercase tracking-wide">
                    {col}
                  </p>
                  <input
                    type="text"
                    placeholder={`filtrar...`}
                    value={(column.getFilterValue() ?? '')}
                    onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-gray-500">Carregando dados...</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto rounded-xl border border-gray-800 min-h-0">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="bg-gray-900 border-b border-gray-800">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-400 whitespace-nowrap"
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-900 hover:bg-gray-800/40 ${
                      i % 2 === 1 ? 'bg-gray-900/20' : ''
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-3 py-1.5 text-gray-300 whitespace-nowrap max-w-xs truncate"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {table.getRowModel().rows.length === 0 && (
              <p className="text-center text-gray-600 py-10 text-sm">
                Nenhum resultado encontrado
              </p>
            )}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between flex-shrink-0">
            <p className="text-sm text-gray-500">
              Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()} ·{' '}
              {PAGE_SIZE} por página
            </p>
            <div className="flex gap-1">
              <button
                className="p-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="p-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
