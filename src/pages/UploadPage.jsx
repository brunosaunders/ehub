import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import { useStore } from '../store/useStore'
import { saveFile } from '../utils/db'
import CSVPreview from '../components/CSVPreview'
import {
  getBigQueryHeaders,
  isBigQueryExportHeaders,
  normalizeBigQueryRows,
} from '../utils/dataHelpers'

export default function UploadPage() {
  const { addFile, primaryColumns, secondaryColumns, tableColumnOrder } = useStore()
  const [step, setStep] = useState('drop') // drop | parsing | preview | saving | done
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)

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
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    await saveFile(id, fileName, parsed.meta.fields || [], parsed.data, {})
    addFile({
      id,
      name: fileName,
      headers: parsed.meta.fields || [],
      rowCount: parsed.data.length,
      mapping: {},
      uploadedAt: new Date().toISOString(),
    })
    setStep('done')
    setTimeout(() => {
      setParsed(null)
      setFileName('')
      setStep('drop')
    }, 2500)
  }

  const reset = () => {
    setParsed(null)
    setFileName('')
    setStep('drop')
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

  if (step === 'drop' || step === 'parsing') {
    return (
      <div className="p-8">
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
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Upload BigQuery CSV</h1>
      <p className="text-sm text-gray-500 mb-6">
        Os campos usados pela análise são extraídos automaticamente de event_params e user_properties.
      </p>

      {parsed && (
        <CSVPreview headers={parsed.meta.fields} data={parsed.data} fileName={fileName} />
      )}

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
    </div>
  )
}
