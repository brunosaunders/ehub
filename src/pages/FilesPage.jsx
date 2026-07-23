import { format } from 'date-fns'
import { useStore } from '../store/useStore'
import { deleteFile } from '../utils/db'

export default function FilesPage() {
  const { files, selectedFileIds, removeFile, toggleFileSelection, selectAll, clearSelection } =
    useStore()

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remover "${name}"?`)) return
    await deleteFile(id)
    removeFile(id)
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-4">📁</div>
          <p className="text-lg">Nenhum arquivo carregado</p>
          <p className="text-sm mt-1">Vá para Upload BigQuery para adicionar arquivos</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Arquivos</h1>
        <div className="flex gap-2">
          <button
            className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            onClick={selectAll}
          >
            Selecionar todos
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
            onClick={clearSelection}
          >
            Limpar seleção
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {files.map((file) => {
          const selected = selectedFileIds.includes(file.id)
          return (
            <div
              key={file.id}
              className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
                selected
                  ? 'border-blue-600 bg-blue-950/20'
                  : 'border-gray-800 bg-gray-900/30 hover:border-gray-700'
              }`}
              onClick={() => toggleFileSelection(file.id)}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggleFileSelection(file.id)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 accent-blue-600 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {file.rowCount?.toLocaleString()} eventos normalizados · {file.headers?.length} colunas
                  {file.uploadedAt
                    ? ` · ${format(new Date(file.uploadedAt), 'dd/MM/yyyy HH:mm')}`
                    : ''}
                </p>
                {file.mapping && Object.keys(file.mapping).length > 0 && (
                  <p className="text-xs text-blue-400 mt-0.5">
                    {Object.values(file.mapping).filter(Boolean).length} colunas mapeadas
                  </p>
                )}
              </div>
              <button
                className="text-sm text-gray-600 hover:text-red-400 transition-colors flex-shrink-0 px-2 py-1"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(file.id, file.name)
                }}
              >
                Remover
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-sm text-gray-600 mt-5">
        {selectedFileIds.length} de {files.length} arquivo(s) selecionado(s) para análise
      </p>
    </div>
  )
}
