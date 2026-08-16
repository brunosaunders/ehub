import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, LayoutDashboard, Zap } from 'lucide-react'
import { useStore } from '../store/useStore'
import { getFilesData } from '../utils/db'
import {
  applyMapping,
  buildDashboardEngagement,
  buildDashboardErrors,
  buildDashboardRequests,
} from '../utils/dataHelpers'
import Heatmap from '../components/dashboard/Heatmap'
import DrilldownPanel from '../components/dashboard/DrilldownPanel'
import EngagementDonut from '../components/dashboard/EngagementDonut'
import StatusBadges from '../components/dashboard/StatusBadges'
import DurationStats from '../components/dashboard/DurationStats'

const LARGE_SELECTION_ROW_THRESHOLD = 500000
const LARGE_SELECTION_ESTIMATED_BYTES = 250 * 1024 * 1024

const SECTIONS = [
  {
    id: 'engagement',
    label: 'Engajamento',
    Icon: LayoutDashboard,
    colorRgb: '59, 130, 246',
    colorClass: 'bg-blue-600',
    countLabel: 'eventos',
    emptyDescription: 'Nenhum evento encontrado nos arquivos selecionados.',
    build: buildDashboardEngagement,
    renderExtra: null,
  },
  {
    id: 'errors',
    label: 'Erros HTTP',
    Icon: AlertTriangle,
    colorRgb: '239, 68, 68',
    colorClass: 'bg-red-600',
    countLabel: 'erros',
    emptyDescription: 'Nenhum evento http_request_error encontrado.',
    build: buildDashboardErrors,
    renderExtra: (item) =>
      item.statusCodes && item.statusCodes.length > 0 ? (
        <StatusBadges codes={item.statusCodes} max={3} />
      ) : null,
  },
  {
    id: 'requests',
    label: 'Requisições HTTP',
    Icon: Zap,
    colorRgb: '34, 197, 94',
    colorClass: 'bg-green-600',
    countLabel: 'requisições',
    emptyDescription: 'Nenhum evento http_request_completed encontrado.',
    build: buildDashboardRequests,
    renderExtra: (item) =>
      item.durationStats ? <DurationStats stats={item.durationStats} /> : null,
  },
]

function SummaryPill({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 px-3 py-2 min-w-fit">
      <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-white mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function EmptyState({ icon, title, description }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-gray-500 max-w-md px-6">
        <div className="text-5xl mb-4">{icon}</div>
        <p className="text-lg text-gray-300">{title}</p>
        {description && <p className="text-sm mt-1">{description}</p>}
      </div>
    </div>
  )
}

function getItemLabel(item) {
  return item.miniapp ?? item.journey ?? item.screen ?? ''
}

function getCurrentItems(sectionData, miniapp, journey) {
  if (journey && miniapp) {
    const selectedMiniapp = sectionData.find((item) => item.miniapp === miniapp)
    return selectedMiniapp?.journeys.find((item) => item.journey === journey)?.screens || []
  }

  if (miniapp) {
    return sectionData.find((item) => item.miniapp === miniapp)?.journeys || []
  }

  return sectionData
}

function toHeatmapItems(items) {
  return items.map((item) => ({
    key: getItemLabel(item),
    label: getItemLabel(item),
    count: item.count,
  }))
}

function buildScreenHeatmapItems(engagementData) {
  const screenMap = new Map()

  engagementData.forEach((miniapp) => {
    miniapp.journeys.forEach((journey) => {
      journey.screens.forEach((screen) => {
        if (!screen.screen || screen.screen === '(sem tela)') return

        const current = screenMap.get(screen.screen) || {
          label: screen.screen,
          count: 0,
          contexts: [],
        }
        current.count += screen.count
        current.contexts.push({
          miniapp: miniapp.miniapp,
          journey: journey.journey,
          count: screen.count,
        })
        screenMap.set(screen.screen, current)
      })
    })
  })

  return [...screenMap.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((screen) => {
      const context = [...screen.contexts].sort((a, b) => b.count - a.count)[0]
      return {
        key: screen.label,
        label: screen.label,
        count: screen.count,
        subtitle: context?.miniapp,
        miniapp: context?.miniapp,
        journey: context?.journey,
      }
    })
}

export default function DashboardPage() {
  const { files, selectedFileIds } = useStore()
  const [allData, setAllData] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState('engagement')
  const [drillMiniapp, setDrillMiniapp] = useState(null)
  const [drillJourney, setDrillJourney] = useState(null)

  const selectedFiles = useMemo(
    () => files.filter((f) => selectedFileIds.includes(f.id)),
    [files, selectedFileIds],
  )

  const totalSelectedRows = useMemo(
    () => selectedFiles.reduce((s, f) => s + Number(f.rowCount || 0), 0),
    [selectedFiles],
  )

  const totalSelectedEstimatedBytes = useMemo(
    () => selectedFiles.reduce((s, f) => s + Number(f.estimatedBytes || 0), 0),
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
      return
    }
    setLoading(true)
    getFilesData(selectedFileIds)
      .then((filesData) => {
        const merged = filesData.flatMap((fd) => {
          const meta = files.find((f) => f.id === fd.id)
          return applyMapping(fd.data, meta?.mapping)
        })
        setAllData(merged)
      })
      .finally(() => setLoading(false))
  }, [selectedFileIds, files, isSelectionTooLarge])

  const deferredData = useDeferredValue(allData)

  const sectionBuilds = useMemo(
    () => ({
      engagement: buildDashboardEngagement(deferredData),
      errors: buildDashboardErrors(deferredData),
      requests: buildDashboardRequests(deferredData),
    }),
    [deferredData],
  )

  const activeSection = SECTIONS.find((s) => s.id === activeSectionId)
  const sectionData = sectionBuilds[activeSectionId] || []

  const drillLevel = drillJourney ? 'screen' : drillMiniapp ? 'journey' : 'miniapp'

  const drillItems = useMemo(() => {
    return getCurrentItems(sectionData, drillMiniapp, drillJourney)
  }, [sectionData, drillMiniapp, drillJourney])

  const currentHeatmapItems = useMemo(() => toHeatmapItems(drillItems), [drillItems])
  const currentHeatmapMaxValue = useMemo(
    () => Math.max(1, ...currentHeatmapItems.map((item) => item.count || 0)),
    [currentHeatmapItems],
  )

  const screenHeatmapItems = useMemo(
    () => buildScreenHeatmapItems(sectionBuilds.engagement),
    [sectionBuilds.engagement],
  )

  const drillMaxCount = useMemo(
    () => Math.max(1, ...drillItems.map((item) => item.count || 0)),
    [drillItems],
  )

  const breadcrumb = useMemo(() => {
    const crumbs = [
      {
        label: 'Miniapps',
        onClick: () => {
          setDrillMiniapp(null)
          setDrillJourney(null)
        },
      },
    ]
    if (drillMiniapp) {
      crumbs.push({ label: drillMiniapp, onClick: () => setDrillJourney(null) })
    }
    if (drillJourney) {
      crumbs.push({ label: drillJourney, onClick: () => {} })
    }
    return crumbs
  }, [drillMiniapp, drillJourney])

  const kpiTotal = sectionData.reduce((s, m) => s + m.count, 0)
  const kpiMiniapps = sectionData.length
  const kpiJourneys = new Set(sectionData.flatMap((m) => m.journeys.map((j) => j.journey))).size

  const currentViewLabel = drillJourney ? 'telas' : drillMiniapp ? 'jornadas' : 'miniapps'
  const selectedDonutLabel = drillLevel === 'miniapp'
    ? drillMiniapp
    : drillLevel === 'journey'
      ? drillJourney
      : null

  if (selectedFileIds.length === 0) {
    return (
      <EmptyState
        icon="📊"
        title="Nenhum arquivo selecionado"
        description="Selecione arquivos na página Arquivos para habilitar o dashboard."
      />
    )
  }

  if (isSelectionTooLarge) {
    return (
      <EmptyState
        icon="🧱"
        title="Dataset grande demais"
        description={`A seleção soma ${totalSelectedRows.toLocaleString('pt-BR')} eventos. Reduza a seleção para habilitar o dashboard.`}
      />
    )
  }

  if (loading) {
    return <EmptyState icon="⏳" title="Carregando dados" />
  }

  const handleHeatmapItemClick = (item) => {
    if (drillLevel === 'miniapp') {
      setDrillMiniapp(item.label)
      setDrillJourney(null)
    } else if (drillLevel === 'journey') {
      setDrillJourney(item.label)
    }
  }

  const handleDonutItemClick = (label) => {
    if (drillLevel === 'miniapp') {
      setDrillMiniapp(label)
      setDrillJourney(null)
    } else if (drillLevel === 'journey') {
      setDrillJourney(label)
    }
  }

  const handleDrillItemClick = (name) => {
    if (drillLevel === 'miniapp') {
      setDrillMiniapp(name)
      setDrillJourney(null)
    } else if (drillLevel === 'journey') {
      setDrillJourney(name)
    }
  }

  const handleSectionChange = (sectionId) => {
    setActiveSectionId(sectionId)
    setDrillMiniapp(null)
    setDrillJourney(null)
  }

  const handleFixedScreenClick = (item) => {
    if (!item.miniapp || !item.journey) return
    setActiveSectionId('engagement')
    setDrillMiniapp(item.miniapp)
    setDrillJourney(item.journey)
  }

  const sectionEmptyNode = (
    <div className="flex items-center justify-center flex-1 min-h-0 rounded-2xl border border-gray-800 bg-gray-950/40">
      <div className="text-center text-gray-500 px-6">
        <div className="text-4xl mb-3">∅</div>
        <p className="text-gray-400 text-sm">{activeSection.emptyDescription}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-full p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Visão analítica por miniapp, jornada e tela.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryPill label={activeSection.countLabel} value={kpiTotal.toLocaleString('pt-BR')} />
          <SummaryPill label="Miniapps" value={kpiMiniapps.toLocaleString('pt-BR')} />
          <SummaryPill label="Jornadas" value={kpiJourneys.toLocaleString('pt-BR')} />
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 flex-shrink-0 bg-gray-900 rounded-xl border border-gray-800 p-1 w-fit">
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              activeSectionId === id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => handleSectionChange(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {sectionData.length === 0 ? sectionEmptyNode : (
        <div className={`grid grid-cols-1 gap-4 min-h-[28rem] ${
          activeSectionId === 'engagement'
            ? 'xl:grid-cols-[minmax(220px,0.72fr)_minmax(280px,1fr)_minmax(300px,1.1fr)]'
            : 'lg:grid-cols-[minmax(320px,1.1fr)_minmax(320px,1fr)]'
        }`}>
          {activeSectionId === 'engagement' && (
            <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4 flex flex-col min-h-0">
              <div className="mb-3 flex-shrink-0">
                <p className="text-sm font-semibold text-white">Proporção por {currentViewLabel}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  Distribuição dos eventos na visão atual.
                </p>
              </div>
              <EngagementDonut
                items={drillItems}
                selectedLabel={selectedDonutLabel}
                onItemClick={handleDonutItemClick}
              />
            </div>
          )}

          <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4 flex flex-col min-h-0">
            <div className="flex items-start justify-between gap-3 mb-3 flex-shrink-0">
              <div>
                <p className="text-sm font-semibold text-white">Heatmap de {currentViewLabel}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  Intensidade relativa por categoria. Clique para aprofundar.
                </p>
              </div>
              {drillMiniapp && (
                <button
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
                  onClick={() => { setDrillMiniapp(null); setDrillJourney(null) }}
                >
                  × Limpar
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <Heatmap
                items={currentHeatmapItems}
                maxValue={currentHeatmapMaxValue}
                colorRgb={activeSection.colorRgb}
                countLabel={activeSection.countLabel}
                onItemClick={drillLevel === 'screen' ? undefined : handleHeatmapItemClick}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4 flex flex-col min-h-0">
            <p className="text-sm font-semibold text-white mb-3 flex-shrink-0">
              Drill-down
              {drillLevel !== 'miniapp' && (
                <span className="ml-2 text-[10px] font-normal text-gray-500 uppercase tracking-widest">
                  {drillLevel === 'journey' ? 'Jornadas' : 'Telas'}
                </span>
              )}
            </p>
            <div className="flex-1 min-h-0">
              <DrilldownPanel
                items={drillItems}
                maxCount={drillMaxCount}
                breadcrumb={breadcrumb}
                onItemClick={handleDrillItemClick}
                countLabel={activeSection.countLabel}
                colorClass={activeSection.colorClass}
                renderItemExtra={activeSection.renderExtra}
              />
            </div>
          </div>
        </div>
      )}

      {screenHeatmapItems.length > 0 && (
        <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-white">Telas mais acessadas</p>
              <p className="text-[10px] text-gray-500 mt-1">
                Heatmap fixo de engajamento, independente da visão selecionada acima.
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.16em] text-blue-300/70 flex-shrink-0">
              Visão fixa
            </span>
          </div>
          <Heatmap
            items={screenHeatmapItems}
            maxValue={Math.max(1, ...screenHeatmapItems.map((item) => item.count || 0))}
            colorRgb="59, 130, 246"
            countLabel="acessos"
            onItemClick={handleFixedScreenClick}
          />
        </section>
      )}
    </div>
  )
}
