import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import { useStore } from '../store/useStore'
import {
  appendFileChunk,
  deleteFile,
  finalizeFileWrite,
  initializeFileWrite,
  saveFile,
} from '../utils/db'
import CSVPreview from '../components/CSVPreview'
import {
  getBigQueryHeaders,
  isBigQueryExportHeaders,
  normalizeBigQueryRows,
} from '../utils/dataHelpers'
import {
  convertBigQueryRows,
  estimateBigQueryQueryCost,
  estimateDownloadSizeFromSample,
  formatBytes,
  getBigQueryJob,
  getBigQueryQueryResultsPage,
  listBigQueryJobs,
} from '../services/bigQueryClient'
import {
  isGoogleTokenExpired,
  requestGoogleAccessToken,
  revokeGoogleAccessToken,
} from '../services/googleAuth'

const BIGQUERY_IMPORT_ROW_WARNING_THRESHOLD = 100000
const BIGQUERY_IMPORT_SIZE_WARNING_BYTES = 25 * 1024 * 1024
const BIGQUERY_STREAMING_IMPORT_ROW_THRESHOLD = 250000
const BIGQUERY_STREAMING_IMPORT_SIZE_BYTES = 100 * 1024 * 1024

function createFileId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatDateTime(value) {
  const date = new Date(Number(value))
  if (Number.isNaN(date.getTime())) return '–'
  return date.toLocaleString('pt-BR')
}

function formatUsd(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value)
}

function getJobLocation(job) {
  if (job?.jobReference?.location) return job.jobReference.location

  const qualifiedId = job?.id || ''
  const location = qualifiedId.split(':')[1]?.split('.')[0]
  return location || ''
}

function buildImportedFileName(projectId, jobId) {
  return `bigquery-${projectId}-${jobId}.json`
}

function collectPopulatedKeys(targetSet, rows) {
  rows.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        targetSet.add(key)
      }
    })
  })
}

function buildHeadersFromCollectedKeys(keySet, preferredOrder = [], fallbackOrder = []) {
  const priority = [...preferredOrder, ...fallbackOrder].filter(
    (key, index, values) => values.indexOf(key) === index && keySet.has(key),
  )
  const others = [...keySet].filter((key) => !priority.includes(key)).sort()
  return [...priority, ...others]
}

export default function UploadPage() {
  const { addFile, primaryColumns, secondaryColumns, tableColumnOrder } = useStore()
  const [googleToken, setGoogleToken] = useState(null)
  const isBigQueryEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
  const isGoogleConnected = Boolean(googleToken?.access_token)

  const [mode, setMode] = useState('csv')
  const [step, setStep] = useState('drop') // drop | parsing | preview | saving | done
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [jobs, setJobs] = useState([])
  const [selectedJobId, setSelectedJobId] = useState('')
  const [selectedJobSummary, setSelectedJobSummary] = useState(null)
  const [bigQueryError, setBigQueryError] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [isLoadingJobDetails, setIsLoadingJobDetails] = useState(false)
  const [isImportingJob, setIsImportingJob] = useState(false)

  const completeSavedFile = useCallback((id, name, headers, rowCount, extraMeta = {}) => {
    const uploadedAt = extraMeta.uploadedAt || new Date().toISOString()

    addFile({
      id,
      name,
      headers,
      rowCount,
      mapping: {},
      uploadedAt,
      ...extraMeta,
    })

    setParsed(null)
    setFileName(name)
    setStep('done')
    setTimeout(() => {
      setParsed(null)
      setFileName('')
      setStep('drop')
    }, 2500)
  }, [addFile])

  const ensureGoogleToken = useCallback(async () => {
    if (googleToken && !isGoogleTokenExpired(googleToken)) return googleToken
    const nextToken = await requestGoogleAccessToken(googleToken)
    setGoogleToken(nextToken)
    return nextToken
  }, [googleToken])

  const processFile = useCallback(
    (file) => {
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Por favor selecione um arquivo .csv')
        return
      }
      setFileName(file.name)
      setStep('parsing')
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const sourceHeaders = results.meta.fields || []

          if (!isBigQueryExportHeaders(sourceHeaders)) {
            alert('Este app aceita apenas CSVs exportados do BigQuery com event_params e user_properties em JSON.')
            setStep('drop')
            return
          }

          try {
            const normalizedRows = normalizeBigQueryRows(results.data)
            const normalizedHeaders = getBigQueryHeaders(
              normalizedRows,
              tableColumnOrder,
              [...primaryColumns, ...secondaryColumns],
            )

            setParsed({
              data: normalizedRows,
              meta: { fields: normalizedHeaders },
              sourceHeaders,
            })
            setStep('preview')
          } catch (error) {
            alert('Erro ao interpretar CSV do BigQuery: ' + error.message)
            setStep('drop')
          }
        },
        error: (err) => {
          alert('Erro ao ler CSV: ' + err.message)
          setStep('drop')
        },
      })
    },
    [primaryColumns, secondaryColumns, tableColumnOrder],
  )

  const handleGoogleConnect = useCallback(async () => {
    setIsAuthLoading(true)
    setBigQueryError('')

    try {
      const token = await requestGoogleAccessToken(googleToken)
      setGoogleToken(token)
    } catch (error) {
      setBigQueryError(error.message)
    } finally {
      setIsAuthLoading(false)
    }
  }, [googleToken])

  const handleGoogleDisconnect = useCallback(() => {
    revokeGoogleAccessToken(googleToken)
    setGoogleToken(null)
    setJobs([])
    setSelectedJobId('')
    setSelectedJobSummary(null)
    setProjectId('')
    setBigQueryError('')
  }, [googleToken])

  const handleLoadJobs = useCallback(async () => {
    if (!projectId.trim()) {
      setBigQueryError('Informe o Project ID para listar os jobs do BigQuery.')
      return
    }

    setIsLoadingJobs(true)
    setBigQueryError('')
    setSelectedJobId('')
    setSelectedJobSummary(null)

    try {
      const token = await ensureGoogleToken()
      const result = await listBigQueryJobs(token.access_token, projectId.trim(), { maxResults: 20 })
      setJobs(result)

      if (result.length === 0) {
        setBigQueryError('Nenhum query job recente foi encontrado para este projeto.')
      }
    } catch (error) {
      setJobs([])
      setBigQueryError(error.message)
    } finally {
      setIsLoadingJobs(false)
    }
  }, [ensureGoogleToken, projectId])

  const handleSelectJob = useCallback(async (job) => {
    const location = getJobLocation(job)
    if (!location) {
      setBigQueryError('Não foi possível identificar a location do job selecionado.')
      return
    }

    setSelectedJobId(job.jobReference.jobId)
    setSelectedJobSummary(null)
    setIsLoadingJobDetails(true)
    setBigQueryError('')

    try {
      const token = await ensureGoogleToken()
      const [details, preview] = await Promise.all([
        getBigQueryJob(token.access_token, projectId.trim(), job.jobReference.jobId, location),
        getBigQueryQueryResultsPage(token.access_token, projectId.trim(), job.jobReference.jobId, {
          location,
          maxResults: 25,
        }),
      ])

      if (details.status?.errorResult) {
        throw new Error(details.status.errorResult.message || 'Este job terminou com erro no BigQuery.')
      }

      const sourceHeaders = (preview.schema?.fields || []).map((field) => field.name)
      if (!isBigQueryExportHeaders(sourceHeaders)) {
        throw new Error('O job precisa retornar event_name, event_params, user_id e user_properties.')
      }

      const previewRows = convertBigQueryRows(preview.schema?.fields || [], preview.rows || [])
      const totalBytesProcessed =
        preview.totalBytesProcessed || details.statistics?.query?.totalBytesProcessed || '0'
      const cacheHit = Boolean(preview.cacheHit ?? details.statistics?.query?.cacheHit)
      const totalRows = preview.totalRows || '0'

      setSelectedJobSummary({
        job: details,
        location,
        sourceHeaders,
        schemaFields: preview.schema?.fields || [],
        previewRows,
        nextPageToken: preview.pageToken || '',
        totalRows,
        totalBytesProcessed,
        cacheHit,
        estimatedDownloadBytes: estimateDownloadSizeFromSample(previewRows, totalRows),
        previewLoadedRows: previewRows.length,
      })
    } catch (error) {
      setSelectedJobId('')
      setSelectedJobSummary(null)
      setBigQueryError(error.message)
    } finally {
      setIsLoadingJobDetails(false)
    }
  }, [ensureGoogleToken, projectId])

  const handleImportSelectedJob = useCallback(async () => {
    if (!selectedJobSummary) return

    const totalRows = Number(selectedJobSummary.totalRows || 0)
    const estimatedDownloadBytes = selectedJobSummary.estimatedDownloadBytes || 0
    const needsWarning =
      totalRows >= BIGQUERY_IMPORT_ROW_WARNING_THRESHOLD ||
      estimatedDownloadBytes >= BIGQUERY_IMPORT_SIZE_WARNING_BYTES

    if (needsWarning) {
      const warningLines = [
        `Este job pode carregar ${totalRows.toLocaleString('pt-BR')} linhas no navegador.`,
      ]

      if (estimatedDownloadBytes > 0) {
        warningLines.push(`Download estimado: ${formatBytes(estimatedDownloadBytes)}.`)
      }

      warningLines.push('Deseja continuar com a importação?')

      if (!window.confirm(warningLines.join('\n'))) {
        return
      }
    }

    setStep('parsing')
    setIsImportingJob(true)
    setBigQueryError('')

    try {
      const token = await ensureGoogleToken()
      const shouldStreamToStorage =
        estimatedDownloadBytes >= BIGQUERY_STREAMING_IMPORT_SIZE_BYTES ||
        totalRows >= BIGQUERY_STREAMING_IMPORT_ROW_THRESHOLD

      if (shouldStreamToStorage) {
        const fileId = createFileId()
        const fileName = buildImportedFileName(projectId.trim(), selectedJobSummary.job.jobReference.jobId)
        const uploadedAt = new Date().toISOString()
        const collectedKeys = new Set()
        const preferredColumns = [...primaryColumns, ...secondaryColumns]
        let chunkIndex = 0
        let persistedRowCount = 0
        try {
          const persistRows = async (rawRows) => {
            if (!Array.isArray(rawRows) || rawRows.length === 0) return

            const normalizedRows = normalizeBigQueryRows(rawRows)
            if (normalizedRows.length === 0) return

            collectPopulatedKeys(collectedKeys, normalizedRows)
            await appendFileChunk(fileId, chunkIndex, normalizedRows)
            chunkIndex += 1
            persistedRowCount += normalizedRows.length
          }

          await initializeFileWrite({
            id: fileId,
            name: fileName,
            headers: [],
            mapping: {},
            uploadedAt,
            rowCount: 0,
            chunkCount: 0,
            estimatedBytes: estimatedDownloadBytes,
            sourceHeaders: selectedJobSummary.sourceHeaders,
            sourceType: 'bigquery',
            storageMode: 'chunked',
          })

          await persistRows(selectedJobSummary.previewRows)

          let nextPageToken = selectedJobSummary.nextPageToken

          while (nextPageToken) {
            const page = await getBigQueryQueryResultsPage(
              token.access_token,
              projectId.trim(),
              selectedJobSummary.job.jobReference.jobId,
              {
                location: selectedJobSummary.location,
                maxResults: 1000,
                pageToken: nextPageToken,
              },
            )

            await persistRows(convertBigQueryRows(selectedJobSummary.schemaFields, page.rows || []))
            nextPageToken = page.pageToken || ''
          }

          const headers = buildHeadersFromCollectedKeys(
            collectedKeys,
            tableColumnOrder,
            preferredColumns,
          )

          await finalizeFileWrite(fileId, {
            name: fileName,
            headers,
            rowCount: persistedRowCount,
            chunkCount: chunkIndex,
            uploadedAt,
            estimatedBytes: estimatedDownloadBytes,
            sourceHeaders: selectedJobSummary.sourceHeaders,
            sourceType: 'bigquery',
            storageMode: 'chunked',
          })

          completeSavedFile(fileId, fileName, headers, persistedRowCount, {
            uploadedAt,
            estimatedBytes: estimatedDownloadBytes,
            sourceType: 'bigquery',
            storageMode: 'chunked',
          })
        } catch (error) {
          await deleteFile(fileId)
          throw error
        }
        return
      }

      const allRows = [...selectedJobSummary.previewRows]
      let nextPageToken = selectedJobSummary.nextPageToken

      while (nextPageToken) {
        const page = await getBigQueryQueryResultsPage(
          token.access_token,
          projectId.trim(),
          selectedJobSummary.job.jobReference.jobId,
          {
            location: selectedJobSummary.location,
            maxResults: 1000,
            pageToken: nextPageToken,
          },
        )

        allRows.push(...convertBigQueryRows(selectedJobSummary.schemaFields, page.rows || []))
        nextPageToken = page.pageToken || ''
      }

      const normalizedRows = normalizeBigQueryRows(allRows)
      const normalizedHeaders = getBigQueryHeaders(
        normalizedRows,
        tableColumnOrder,
        [...primaryColumns, ...secondaryColumns],
      )

      setFileName(buildImportedFileName(projectId.trim(), selectedJobSummary.job.jobReference.jobId))
      setParsed({
        data: normalizedRows,
        meta: { fields: normalizedHeaders },
        sourceHeaders: selectedJobSummary.sourceHeaders,
      })
      setStep('preview')
    } catch (error) {
      setStep('drop')
      setBigQueryError(error.message)
    } finally {
      setIsImportingJob(false)
    }
  }, [ensureGoogleToken, primaryColumns, projectId, secondaryColumns, selectedJobSummary, tableColumnOrder])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragging(false)
      processFile(e.dataTransfer.files[0])
    },
    [processFile],
  )

  const handleSave = async () => {
    if (!parsed) return
    setStep('saving')
    const id = createFileId()
    const uploadedAt = new Date().toISOString()
    await saveFile(id, fileName, parsed.meta.fields || [], parsed.data, {}, { uploadedAt })
    completeSavedFile(id, fileName, parsed.meta.fields || [], parsed.data.length, { uploadedAt })
  }

  const reset = () => {
    setParsed(null)
    setFileName('')
    setStep('drop')
  }

  const renderModeToggle = () => (
    <div className="inline-flex rounded-xl border border-gray-800 bg-gray-900/50 p-1 mb-6">
      <button
        className={`px-4 py-2 text-sm rounded-lg transition-colors ${
          mode === 'csv' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
        }`}
        onClick={() => {
          setMode('csv')
          reset()
        }}
      >
        CSV
      </button>
      <button
        className={`px-4 py-2 text-sm rounded-lg transition-colors ${
          mode === 'bigquery' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
        }`}
        onClick={() => {
          setMode('bigquery')
          reset()
        }}
      >
        BigQuery
      </button>
    </div>
  )

  const renderCsvImport = () => (
    <>
      <h1 className="text-2xl font-bold text-white mb-2">Upload BigQuery CSV</h1>
      <p className="text-sm text-gray-500 mb-6">
        Aceita apenas exports do BigQuery com colunas JSON em event_params e user_properties.
      </p>
      <label
        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-16 cursor-pointer transition-colors ${
          isDragging ? 'border-blue-400 bg-blue-950/20' : 'border-gray-700 hover:border-gray-500'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => processFile(e.target.files[0])}
        />
        <span className="text-5xl mb-5">📂</span>
        <p className="text-xl text-gray-300 font-medium">
          {step === 'parsing' ? 'Normalizando export do BigQuery...' : 'Arraste um CSV do BigQuery aqui'}
        </p>
        {step !== 'parsing' && (
          <p className="text-gray-500 text-sm mt-2">ou clique para selecionar o arquivo</p>
        )}
      </label>
    </>
  )

  const renderBigQueryImport = () => {
    const estimatedCost = estimateBigQueryQueryCost(
      selectedJobSummary?.totalBytesProcessed,
      selectedJobSummary?.cacheHit,
    )

    return (
      <>
        <h1 className="text-2xl font-bold text-white mb-2">Importar Job do BigQuery</h1>
        <p className="text-sm text-gray-500 mb-6">
          Conecte sua conta Google, liste os jobs do projeto e importe localmente os resultados.
        </p>

        {!isBigQueryEnabled && (
          <div className="mb-6 rounded-2xl border border-amber-700/40 bg-amber-950/20 p-4 text-sm text-amber-200">
            Defina <span className="font-mono">VITE_GOOGLE_CLIENT_ID</span> para habilitar a integração direta com o BigQuery.
          </div>
        )}

        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5 space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-white">Conta Google</p>
              <p className="text-xs text-gray-500 mt-1">
                O acesso usa a permissão da conta autenticada no navegador.
              </p>
              <p className="text-xs mt-2 text-gray-400">
                Status: {isGoogleConnected ? 'conectada' : 'desconectada'}
              </p>
            </div>

            {isGoogleConnected ? (
              <button
                className="px-4 py-2 bg-gray-800 text-gray-200 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                onClick={handleGoogleDisconnect}
              >
                Desconectar
              </button>
            ) : (
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm disabled:opacity-50"
                onClick={handleGoogleConnect}
                disabled={!isBigQueryEnabled || isAuthLoading}
              >
                {isAuthLoading ? 'Conectando...' : 'Conectar com Google'}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1">
              <span className="text-xs text-gray-400 block mb-1.5">Project ID</span>
              <input
                className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                placeholder="meu-projeto"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
            </label>

            <button
              className="px-4 py-2.5 bg-gray-800 text-gray-200 rounded-xl hover:bg-gray-700 transition-colors text-sm disabled:opacity-50"
              onClick={handleLoadJobs}
              disabled={!isBigQueryEnabled || !isGoogleConnected || isLoadingJobs}
            >
              {isLoadingJobs ? 'Carregando jobs...' : 'Carregar jobs'}
            </button>
          </div>

          {bigQueryError && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-200">
              {bigQueryError}
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Jobs recentes</p>
                <p className="text-xs text-gray-500">{jobs.length} encontrado(s)</p>
              </div>

              <div className="space-y-2 max-h-[32rem] overflow-auto pr-1">
                {jobs.map((job) => {
                  const isSelected = selectedJobId === job.jobReference.jobId
                  const location = getJobLocation(job)
                  const bytesProcessed = job.statistics?.query?.totalBytesProcessed

                  return (
                    <button
                      key={job.jobReference.jobId}
                      className={`w-full text-left rounded-xl border p-4 transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-950/20'
                          : 'border-gray-800 bg-gray-950/40 hover:border-gray-700'
                      }`}
                      onClick={() => handleSelectJob(job)}
                      disabled={isLoadingJobDetails}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">{job.jobReference.jobId}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDateTime(job.statistics?.creationTime)} · {location || 'sem location'}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-300 flex-shrink-0">
                          {job.status?.errorResult ? 'erro' : job.state?.toLowerCase() || 'job'}
                        </span>
                      </div>

                      <p className="text-xs text-gray-400 mt-3">
                        {bytesProcessed ? `Bytes processados: ${formatBytes(bytesProcessed)}` : 'Bytes processados indisponíveis'}
                      </p>
                    </button>
                  )
                })}

                {!isLoadingJobs && jobs.length === 0 && (
                  <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 text-sm text-gray-500">
                    Conecte sua conta e carregue um projeto para listar os query jobs recentes.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
                <p className="text-sm font-medium text-white mb-4">Resumo do job</p>

                {isLoadingJobDetails && (
                  <p className="text-sm text-gray-400">Lendo detalhes e primeira página do job...</p>
                )}

                {!isLoadingJobDetails && !selectedJobSummary && (
                  <p className="text-sm text-gray-500">
                    Selecione um job para ver linhas, bytes processados e o impacto aproximado da importação local.
                  </p>
                )}

                {!isLoadingJobDetails && selectedJobSummary && (
                  <div className="space-y-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Job ID</span>
                        <span className="text-gray-200 text-right break-all">{selectedJobSummary.job.jobReference.jobId}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Linhas retornadas</span>
                        <span className="text-gray-200">{Number(selectedJobSummary.totalRows || 0).toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Bytes processados na query</span>
                        <span className="text-gray-200">{formatBytes(selectedJobSummary.totalBytesProcessed)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Custo estimado da query original</span>
                        <span className="text-gray-200">{formatUsd(estimatedCost)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Tamanho estimado para baixar</span>
                        <span className="text-gray-200">
                          {selectedJobSummary.estimatedDownloadBytes
                            ? formatBytes(selectedJobSummary.estimatedDownloadBytes)
                            : 'estimativa indisponível'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">Cache do BigQuery</span>
                        <span className="text-gray-200">{selectedJobSummary.cacheHit ? 'sim' : 'não'}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 text-xs text-blue-100">
                      Importar um job existente não reexecuta a query. O principal impacto agora é o volume de dados que será baixado e processado no navegador.
                    </div>

                    {(Number(selectedJobSummary.totalRows || 0) >= BIGQUERY_IMPORT_ROW_WARNING_THRESHOLD ||
                      Number(selectedJobSummary.estimatedDownloadBytes || 0) >= BIGQUERY_IMPORT_SIZE_WARNING_BYTES) && (
                      <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs text-amber-100">
                        Aviso: este job pode ser pesado para importar localmente. Considere filtrar a query no BigQuery ou testar primeiro com um resultado menor.
                      </div>
                    )}

                    <button
                      className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors text-sm font-medium disabled:opacity-50"
                      onClick={handleImportSelectedJob}
                      disabled={isImportingJob || step === 'parsing'}
                    >
                      {isImportingJob || step === 'parsing' ? 'Importando job...' : 'Importar job'}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5 space-y-3">
                <p className="text-sm font-medium text-amber-50">Como configurar o acesso ao Google</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-sm text-amber-100/90">
                  <li>Abra o Google Cloud Console no mesmo projeto do BigQuery.</li>
                  <li>Vá em APIs e serviços &gt; Tela de consentimento OAuth e conclua a configuração inicial, se ainda não existir.</li>
                  <li>Vá em APIs e serviços &gt; Credenciais e crie um ID do cliente OAuth do tipo Aplicativo da Web.</li>
                  <li>Em Origens JavaScript autorizadas, adicione <span className="font-mono">http://localhost:5173</span>.</li>
                  <li>Crie um arquivo <span className="font-mono">.env.local</span> na raiz com <span className="font-mono">VITE_GOOGLE_CLIENT_ID=seu_client_id</span>.</li>
                  <li>Reinicie o front com <span className="font-mono">npm run dev</span> e tente conectar novamente.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (step === 'done') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-400">Arquivo salvo!</h2>
          <p className="text-gray-400 mt-2">{fileName}</p>
        </div>
      </div>
    )
  }

  if (step === 'drop') {
    return (
      <div className="p-8">
        {renderModeToggle()}
        {mode === 'csv' ? renderCsvImport() : renderBigQueryImport()}
      </div>
    )
  }

  if (step === 'parsing' && mode === 'csv') {
    return (
      <div className="p-8">
        {renderModeToggle()}
        {renderCsvImport()}
      </div>
    )
  }

  if (step === 'parsing' && mode === 'bigquery') {
    return (
      <div className="p-8">
        {renderModeToggle()}
        {renderBigQueryImport()}
      </div>
    )
  }

  return (
    <div className="p-8">
      {renderModeToggle()}

      {parsed ? (
        <>
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-2xl font-bold text-white">
              {mode === 'bigquery' ? 'Pré-visualização do Job' : 'Upload BigQuery CSV'}
            </h1>

            {mode === 'bigquery' && isGoogleConnected && (
              <button
                className="px-4 py-2 bg-gray-800 text-gray-200 rounded-lg hover:bg-gray-700 transition-colors text-sm flex-shrink-0"
                onClick={handleGoogleDisconnect}
              >
                Desconectar Google
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Os campos usados pela análise são extraídos automaticamente de event_params e user_properties.
          </p>

          <CSVPreview headers={parsed.meta.fields} data={parsed.data} fileName={fileName} />

          <div className="flex gap-3 mt-6">
            <button
              className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm"
              onClick={reset}
            >
              Cancelar
            </button>
            <button
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium disabled:opacity-50"
              onClick={handleSave}
              disabled={step === 'saving'}
            >
              {step === 'saving' ? 'Salvando...' : 'Salvar Arquivo'}
            </button>
          </div>
        </>
      ) : (
        renderBigQueryImport()
      )}
    </div>
  )
}
