import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Network, Rows3, Sparkles } from 'lucide-react'
import HolisticGraph from '../components/HolisticGraph'
import { useStore } from '../store/useStore'
import { getFilesData } from '../utils/db'
import { applyMapping, buildHolisticOverview } from '../utils/dataHelpers'

const LARGE_SELECTION_ROW_THRESHOLD = 500000
const LARGE_SELECTION_ESTIMATED_BYTES = 250 * 1024 * 1024

function SummaryPill({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-white mt-1">{value}</p>
    </div>
  )
}

function EmptyState({ icon, title, description }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-gray-500 max-w-md px-6">
        <div className="text-5xl mb-4">{icon}</div>
        <p className="text-lg text-gray-300">{title}</p>
        <p className="text-sm mt-1">{description}</p>
      </div>
    </div>
  )
}

export default function HolisticViewPage() {
  const { files, selectedFileIds } = useStore()
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(false)
  const [expandedMiniapps, setExpandedMiniapps] = useState({})
  const [expandedJourneys, setExpandedJourneys] = useState({})
  const [activeMiniapp, setActiveMiniapp] = useState('')
  const selectedFiles = useMemo(
    () => files.filter((file) => selectedFileIds.includes(file.id)),
    [files, selectedFileIds],
  )
  const totalSelectedRows = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + Number(file.rowCount || 0), 0),
    [selectedFiles],
  )
  const totalSelectedEstimatedBytes = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + Number(file.estimatedBytes || 0), 0),
    [selectedFiles],
  )
  const isSelectionTooLarge =
    totalSelectedRows >= LARGE_SELECTION_ROW_THRESHOLD ||
    totalSelectedEstimatedBytes >= LARGE_SELECTION_ESTIMATED_BYTES

  useEffect(() => {
    if (selectedFileIds.length === 0) {
      setAllData([])
      return
    }

    if (isSelectionTooLarge) {
      setAllData([])
      setLoading(false)
      return
    }

    setLoading(true)
    getFilesData(selectedFileIds)
      .then((filesData) => {
        const merged = filesData.flatMap((fileData) => {
          const meta = files.find((file) => file.id === fileData.id)
          return applyMapping(fileData.data, meta?.mapping)
        })
        setAllData(merged)
      })
      .finally(() => setLoading(false))
  }, [selectedFileIds, files, isSelectionTooLarge])

  const deferredData = useDeferredValue(allData)
  const miniapps = useMemo(() => buildHolisticOverview(deferredData), [deferredData])
  const selectedMiniapp = useMemo(
    () => miniapps.find((miniapp) => miniapp.miniapp === activeMiniapp) ?? null,
    [miniapps, activeMiniapp],
  )
  const isComputing = deferredData !== allData

  useEffect(() => {
    if (miniapps.length === 0) {
      setActiveMiniapp('')
      return
    }

    if (!miniapps.some((miniapp) => miniapp.miniapp === activeMiniapp)) {
      const firstMiniapp = miniapps[0].miniapp
      setActiveMiniapp(firstMiniapp)
      setExpandedMiniapps((current) => ({ ...current, [firstMiniapp]: true }))
    }
  }, [miniapps, activeMiniapp])

  const toggleMiniapp = (miniappName) => {
    setExpandedMiniapps((current) => ({
      ...current,
      [miniappName]: !current[miniappName],
    }))
  }

  const toggleJourney = (miniappName, journeyName) => {
    const key = `${miniappName}::${journeyName}`
    setExpandedJourneys((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  if (selectedFileIds.length === 0) {
    return (
      <EmptyState
        icon="🧭"
        title="Nenhum arquivo selecionado"
        description="Selecione arquivos na página Arquivos para habilitar a visão holística."
      />
    )
  }

  if (loading) {
    return (
      <EmptyState
        icon="⏳"
        title="Carregando base consolidada"
        description="Mesclando os arquivos selecionados e preparando a visão holística."
      />
    )
  }

  if (isSelectionTooLarge) {
    return (
      <EmptyState
        icon="🧱"
        title="Dataset grande demais para a visão holística no navegador"
        description={`A seleção atual soma ${totalSelectedRows.toLocaleString('pt-BR')} eventos. Para evitar travamentos, essa tela só processa subconjuntos menores.`}
      />
    )
  }

  if (miniapps.length === 0) {
    return (
      <EmptyState
        icon="∅"
        title="Nenhum miniapp encontrado"
        description="Os arquivos selecionados não possuem dados suficientes para construir a visão holística."
      />
    )
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Visão Holística</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Explora a base por miniapp, jornada e telas, com hierarquia plana e um grafo
            agregado de navegação por miniapp.
          </p>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 min-w-fit">
          <SummaryPill label="Miniapps" value={miniapps.length.toLocaleString()} />
          <SummaryPill
            label="Jornadas"
            value={miniapps.reduce((sum, miniapp) => sum + miniapp.journeys.length, 0).toLocaleString()}
          />
          <SummaryPill
            label="Eventos"
            value={allData.length.toLocaleString()}
          />
          <SummaryPill
            label="Processamento"
            value={isComputing ? 'Agregando...' : 'Pronto'}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[24rem,minmax(0,1fr)] gap-4 flex-1 min-h-0">
        <section className="min-h-0 rounded-2xl border border-gray-800 bg-gray-950/40 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/70">
            <div>
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <Rows3 size={15} className="text-blue-400" />
                Listagem plana
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Miniapps expansíveis com jornadas e telas agregadas.
              </p>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
            {miniapps.map((miniapp) => {
              const miniappExpanded = expandedMiniapps[miniapp.miniapp] ?? miniapp.miniapp === activeMiniapp

              return (
                <div
                  key={miniapp.miniapp}
                  className={`rounded-2xl border transition-colors ${
                    activeMiniapp === miniapp.miniapp
                      ? 'border-blue-600 bg-blue-950/10'
                      : 'border-gray-800 bg-gray-900/40'
                  }`}
                >
                  <div className="flex items-start gap-2 p-3">
                    <button
                      className="mt-1 text-gray-500 hover:text-white transition-colors"
                      onClick={() => toggleMiniapp(miniapp.miniapp)}
                      aria-label={miniappExpanded ? 'Recolher miniapp' : 'Expandir miniapp'}
                    >
                      {miniappExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => {
                        setActiveMiniapp(miniapp.miniapp)
                        setExpandedMiniapps((current) => ({ ...current, [miniapp.miniapp]: true }))
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{miniapp.miniapp}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {miniapp.totalViews.toLocaleString()} views · {miniapp.totalSessions.toLocaleString()} sessões · {miniapp.totalUsers.toLocaleString()} usuários
                          </p>
                        </div>
                        {activeMiniapp === miniapp.miniapp && (
                          <span className="text-[10px] uppercase tracking-[0.16em] text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-1">
                            Ativo
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {miniappExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {miniapp.journeys.map((journey) => {
                        const journeyKey = `${miniapp.miniapp}::${journey.journey}`
                        const journeyExpanded = expandedJourneys[journeyKey] ?? journey === miniapp.journeys[0]

                        return (
                          <div key={journeyKey} className="rounded-xl border border-gray-800 bg-black/20">
                            <button
                              className="w-full flex items-start gap-2 p-3 text-left"
                              onClick={() => toggleJourney(miniapp.miniapp, journey.journey)}
                            >
                              <span className="mt-0.5 text-gray-500">
                                {journeyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-100 truncate">{journey.journey}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {journey.totalViews.toLocaleString()} views · {journey.screenCount.toLocaleString()} telas · {journey.totalSessions.toLocaleString()} sessões
                                </p>
                              </div>
                            </button>

                            {journeyExpanded && (
                              <div className="px-3 pb-3 space-y-1.5">
                                {journey.screens.map((screen) => (
                                  <div
                                    key={`${journeyKey}::${screen.screen}`}
                                    className="rounded-lg border border-gray-800/80 bg-gray-950/60 px-3 py-2"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <p className="text-sm text-gray-200 break-words">{screen.screen}</p>
                                      <span className="text-xs text-blue-300 bg-blue-500/10 rounded-full px-2 py-1 flex-shrink-0">
                                        {screen.views.toLocaleString()} views
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                      {screen.userCount.toLocaleString()} usuários · {screen.events.toLocaleString()} eventos de navegação
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="min-h-0 rounded-2xl border border-gray-800 bg-gray-950/40 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/70 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white flex items-center gap-2">
                <Network size={15} className="text-cyan-400" />
                Árvore do miniapp
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Telas agrupadas por jornada, com contagem de visualizações nos nós e contagem de transições nas arestas.
              </p>
            </div>
            {selectedMiniapp && (
              <div className="text-right flex-shrink-0">
                <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Miniapp ativo</p>
                <p className="text-sm font-semibold text-white mt-1">{selectedMiniapp.miniapp}</p>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-b border-gray-800 bg-gray-950/40 flex gap-2 overflow-auto">
            {miniapps.map((miniapp) => (
              <button
                key={miniapp.miniapp}
                className={`px-3 py-2 rounded-xl border text-sm whitespace-nowrap transition-colors ${
                  miniapp.miniapp === activeMiniapp
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-700'
                }`}
                onClick={() => {
                  setActiveMiniapp(miniapp.miniapp)
                  setExpandedMiniapps((current) => ({ ...current, [miniapp.miniapp]: true }))
                }}
              >
                {miniapp.miniapp}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {selectedMiniapp ? (
              <HolisticGraph miniapp={selectedMiniapp} />
            ) : (
              <div className="h-full flex items-center justify-center text-center text-gray-500 px-6">
                <div>
                  <div className="text-5xl mb-4">🕸️</div>
                  <p className="text-lg text-gray-300">Selecione um miniapp</p>
                  <p className="text-sm mt-1">
                    A seleção amplia a área do grafo para explorar as conexões entre telas.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {isComputing && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-800/60 rounded-xl px-3 py-2">
          <Sparkles size={14} />
          Recalculando agregações em segundo plano para manter a interface responsiva.
        </div>
      )}
    </div>
  )
}