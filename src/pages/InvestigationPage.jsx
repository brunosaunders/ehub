import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { getFilesData } from '../utils/db'
import { applyMapping, getSessionById, getSessions, formatTimestamp } from '../utils/dataHelpers'
import SessionGraph from '../components/SessionGraph'
import { ArrowLeft, Check, ChevronsUpDown } from 'lucide-react'

export default function InvestigationPage() {
  const { files, selectedFileIds } = useStore()
  const [allData, setAllData] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const [searchType, setSearchType] = useState('user_id')
  const [userId, setUserId] = useState('')
  const [sessions, setSessions] = useState([])
  const [searched, setSearched] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [sortDesc, setSortDesc] = useState(true)
  const [userPickerOpen, setUserPickerOpen] = useState(false)

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

    if (searchType === 'session_id') {
      const session = getSessionById(allData, id)
      setSessions([])
      setSelectedSession(session)
      setSearched(true)
      return
    }

    const result = getSessions(allData, id)
    setSessions(result)
    setSearched(true)
    setSelectedSession(null)
  }

  const availableUsers = useMemo(() => {
    const userMap = new Map()

    allData.forEach((row) => {
      const normalizedUserId = String(row?.user_id ?? '').trim()
      if (!normalizedUserId) return

      if (!userMap.has(normalizedUserId)) {
        userMap.set(normalizedUserId, {
          id: normalizedUserId,
          eventCount: 0,
          sessions: new Set(),
          lastTimestamp: 0,
        })
      }

      const entry = userMap.get(normalizedUserId)
      entry.eventCount += 1

      const sessionId = String(row?.session_id ?? '').trim()
      if (sessionId) {
        entry.sessions.add(sessionId)
      }

      const timestamp = Number(row?.app_timestamp ?? 0)
      if (Number.isFinite(timestamp) && timestamp > entry.lastTimestamp) {
        entry.lastTimestamp = timestamp
      }
    })

    return [...userMap.values()]
      .map((entry) => ({
        id: entry.id,
        eventCount: entry.eventCount,
        sessionCount: entry.sessions.size,
        lastTimestamp: entry.lastTimestamp,
      }))
      .sort((left, right) => right.eventCount - left.eventCount || left.id.localeCompare(right.id))
  }, [allData])

  const filteredUsers = useMemo(() => {
    const query = userId.trim().toLowerCase()
    if (!query) return availableUsers
    return availableUsers.filter((user) => user.id.toLowerCase().includes(query))
  }, [availableUsers, userId])

  const selectUser = (nextUserId) => {
    setUserId(nextUserId)
    setSearchType('user_id')
    setUserPickerOpen(false)
    const result = getSessions(allData, nextUserId)
    setSessions(result)
    setSelectedSession(null)
    setSearched(true)
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
          <div className="flex bg-gray-900 border border-gray-700 rounded-xl p-1">
            {['user_id', 'session_id'].map((type) => (
              <button
                key={type}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  searchType === type
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => {
                  setSearchType(type)
                  setUserPickerOpen(false)
                  setSessions([])
                  setSelectedSession(null)
                  setSearched(false)
                  setUserId('')
                }}
              >
                {type}
              </button>
            ))}
          </div>

          {searchType === 'user_id' ? (
            <div className="flex-1 relative">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Filtrar user_id"
                    value={userId}
                    onChange={(e) => {
                      setUserId(e.target.value)
                      setUserPickerOpen(true)
                    }}
                    onFocus={() => setUserPickerOpen(true)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 pr-11 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-white transition-colors"
                    onClick={() => setUserPickerOpen((current) => !current)}
                    aria-label="Abrir lista de user_id"
                  >
                    <ChevronsUpDown size={16} />
                  </button>
                </div>
              </div>

              {userPickerOpen && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl shadow-black/40">
                  <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-500">
                      User IDs disponíveis
                    </p>
                    <span className="text-xs text-gray-500">
                      {filteredUsers.length} / {availableUsers.length}
                    </span>
                  </div>
                  <div className="max-h-72 overflow-auto p-2">
                    {filteredUsers.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-gray-500">
                        Nenhum user_id corresponde ao filtro atual.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {filteredUsers.map((user) => {
                          const isSelected = user.id === userId.trim()

                          return (
                            <button
                              key={user.id}
                              type="button"
                              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-950/20'
                                  : 'border-transparent bg-gray-900/60 hover:border-gray-700 hover:bg-gray-900'
                              }`}
                              onClick={() => selectUser(user.id)}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-blue-300">{user.id}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {user.sessionCount} sessões · {user.eventCount} eventos
                                </p>
                              </div>
                              {isSelected ? (
                                <Check size={15} className="flex-shrink-0 text-blue-300" />
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <input
              type="text"
              placeholder={searchType}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          )}

          <button
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors font-medium disabled:opacity-50"
            onClick={handleSearch}
            disabled={dataLoading}
          >
            {dataLoading ? 'Carregando...' : 'Buscar'}
          </button>
        </div>
      )}

      {!selectedSession && searchType === 'user_id' && !dataLoading && availableUsers.length > 0 && (
        <div className="flex-shrink-0 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">User IDs disponíveis</p>
              <p className="mt-1 text-xs text-gray-500">
                Selecione um identificador da lista ou filtre pelo campo acima.
              </p>
            </div>
            <span className="rounded-full border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs text-gray-400">
              {availableUsers.length} user_ids
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 max-h-28 overflow-auto pr-1">
            {filteredUsers.slice(0, 30).map((user) => {
              const isSelected = user.id === userId.trim()

              return (
                <button
                  key={user.id}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-950/20 text-blue-300'
                      : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-white'
                  }`}
                  onClick={() => selectUser(user.id)}
                >
                  {user.id}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Session list */}
      {!selectedSession && searched && searchType === 'user_id' && (
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

      {!selectedSession && searched && searchType === 'session_id' && (
        <div className="flex-1 flex items-center justify-center min-h-0">
          <p className="text-gray-500 text-center py-12">
            Nenhuma sessão encontrada para <span className="text-gray-300">"{userId}"</span>
          </p>
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
