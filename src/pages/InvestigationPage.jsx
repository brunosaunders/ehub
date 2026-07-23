import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { getFilesData } from '../utils/db'
import { applyMapping, getSessions, formatTimestamp } from '../utils/dataHelpers'
import SessionGraph from '../components/SessionGraph'
import { ArrowLeft } from 'lucide-react'

export default function InvestigationPage() {
  const { files, selectedFileIds } = useStore()
  const [allData, setAllData] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [sessions, setSessions] = useState([])
  const [searched, setSearched] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [sortDesc, setSortDesc] = useState(true)

  useEffect(() => {
    if (selectedFileIds.length === 0) return
    setDataLoading(true)
    getFilesData(selectedFileIds).then((filesData) => {
      const merged = filesData.flatMap((fd) => {
        const meta = files.find((f) => f.id === fd.id)
        return applyMapping(fd.data, meta?.mapping)
      })
      setAllData(merged)
      setDataLoading(false)
    })
  }, [selectedFileIds, files])

  const handleSearch = () => {
    const id = userId.trim()
    if (!id) return
    const result = getSessions(allData, id)
    setSessions(result)
    setSearched(true)
    setSelectedSession(null)
  }

  const sortedSessions = sortDesc ? [...sessions].reverse() : sessions

  if (selectedFileIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-lg">Nenhum arquivo selecionado</p>
          <p className="text-sm mt-1">Selecione arquivos na página Arquivos</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6 gap-5">
      <h1 className="text-2xl font-bold text-white flex-shrink-0">Investigação</h1>

      {/* Search bar */}
      {!selectedSession && (
        <div className="flex gap-3 flex-shrink-0">
          <input
            type="text"
            placeholder="user_id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <button
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors font-medium disabled:opacity-50"
            onClick={handleSearch}
            disabled={dataLoading}
          >
            {dataLoading ? 'Carregando...' : 'Buscar'}
          </button>
        </div>
      )}

      {/* Session list */}
      {!selectedSession && searched && (
        <div className="flex-1 overflow-auto min-h-0">
          {sessions.length === 0 ? (
            <p className="text-gray-500 text-center py-12">
              Nenhuma sessão encontrada para <span className="text-gray-300">"{userId}"</span>
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-white">
                  Sessões de{' '}
                  <span className="text-blue-400">{userId}</span>
                  <span className="text-gray-500 text-sm font-normal ml-2">
                    ({sessions.length})
                  </span>
                </h2>
                <button
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                  onClick={() => setSortDesc((v) => !v)}
                >
                  {sortDesc ? '↓ Mais recentes' : '↑ Mais antigas'}
                </button>
              </div>

              <div className="space-y-2">
                {sortedSessions.map((session) => (
                  <button
                    key={session.id}
                    className="w-full text-left p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-blue-600 transition-colors"
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-blue-400 truncate">{session.id}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="text-gray-400">Início:</span>{' '}
                          {formatTimestamp(session.startTs)}
                        </p>
                        <p className="text-xs text-gray-500">
                          <span className="text-gray-400">Fim:</span>{' '}
                          {formatTimestamp(session.endTs)}
                        </p>
                      </div>
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-lg flex-shrink-0">
                        {session.eventCount} eventos
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Session graph */}
      {selectedSession && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              onClick={() => setSelectedSession(null)}
            >
              <ArrowLeft size={15} /> Voltar
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">
                Sessão:{' '}
                <span className="text-blue-400 font-mono text-sm">{selectedSession.id}</span>
              </h2>
              <p className="text-xs text-gray-500">
                {formatTimestamp(selectedSession.startTs)} →{' '}
                {formatTimestamp(selectedSession.endTs)} · {selectedSession.eventCount} eventos
              </p>
            </div>
          </div>

          <div className="flex-1 border border-gray-800 rounded-xl overflow-hidden min-h-0">
            <SessionGraph events={selectedSession.events} />
          </div>
        </div>
      )}
    </div>
  )
}
