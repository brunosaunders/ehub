import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useStore } from '../store/useStore'

function moveItem(tags, tag, direction, onChange) {
  const index = tags.indexOf(tag)
  const nextIndex = index + direction
  if (index === -1 || nextIndex < 0 || nextIndex >= tags.length) return

  const reordered = [...tags]
  ;[reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]
  onChange(reordered)
}

function SortableTagList({ tags, onChange, removable = true, classifyTag }) {
  const remove = (tag) => onChange(tags.filter((t) => t !== tag))

  return (
    <div className="space-y-2 mb-3 min-h-[2rem]">
        {tags.map((tag, index) => (
          <div
            key={tag}
            className="flex items-center gap-2 bg-gray-800 text-gray-300 text-sm px-3 py-2 rounded-lg"
          >
            <GripVertical size={14} className="text-gray-600 flex-shrink-0" />
            {classifyTag ? classifyTag(tag) : null}
            <span className="flex-1 min-w-0 truncate">{tag}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => moveItem(tags, tag, -1, onChange)}
                disabled={index === 0}
                aria-label={`Mover ${tag} para cima`}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => moveItem(tags, tag, 1, onChange)}
                disabled={index === tags.length - 1}
                aria-label={`Mover ${tag} para baixo`}
              >
                <ArrowDown size={14} />
              </button>
              {removable && (
                <button
                  className="px-2 py-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                  onClick={() => remove(tag)}
                  aria-label={`Remover ${tag}`}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-gray-600 py-1">Nenhum item</span>
        )}

    </div>
  )
}

function TagEditor({ label, description, tags, onChange }) {
  const [input, setInput] = useState('')

  const add = () => {
    const t = input.trim()
    if (t && !tags.includes(t)) {
      onChange([...tags, t])
      setInput('')
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5">
      <h3 className="font-semibold text-white mb-0.5">{label}</h3>
      {description && <p className="text-xs text-gray-500 mb-4">{description}</p>}

      <SortableTagList tags={tags} onChange={onChange} />

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Adicionar..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        <button
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
          onClick={add}
        >
          +
        </button>
      </div>
    </div>
  )
}

function TableOrderEditor({ label, description, tags, onChange, primaryColumns }) {
  const primarySet = new Set(primaryColumns)

  return (
    <div className="bg-gray-900 rounded-xl p-5">
      <h3 className="font-semibold text-white mb-0.5">{label}</h3>
      {description && <p className="text-xs text-gray-500 mb-4">{description}</p>}

      <SortableTagList
        tags={tags}
        onChange={onChange}
        removable={false}
        classifyTag={(tag) => (
          <span
            className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded flex-shrink-0 ${
              primarySet.has(tag)
                ? 'bg-blue-950 text-blue-300'
                : 'bg-gray-700 text-gray-300'
            }`}
          >
            {primarySet.has(tag) ? 'Principal' : 'Opcional'}
          </span>
        )}
      />
    </div>
  )
}

export default function SettingsPage() {
  const {
    primaryColumns, setPrimaryColumns,
    secondaryColumns, setSecondaryColumns,
    tableColumnOrder, setTableColumnOrder,
    keyEvents, setKeyEvents,
  } = useStore()

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-2">Configurações</h1>
      <p className="text-sm text-gray-500 mb-7">
        Personalize as colunas e eventos usados nas análises. A ordem definida aqui é salva e reaplicada na tabela.
      </p>

      <div className="space-y-4">
        <TableOrderEditor
          label="Ordem das Colunas na Tabela"
          description="Misture colunas principais e opcionais na ordem que preferir. Para remover uma coluna daqui, ajuste sua lista de origem abaixo."
          tags={tableColumnOrder}
          onChange={setTableColumnOrder}
          primaryColumns={primaryColumns}
        />
        <TagEditor
          label="Colunas Principais"
          description="Colunas base da análise. Adições e remoções daqui também afetam a lista de ordenação da tabela."
          tags={primaryColumns}
          onChange={setPrimaryColumns}
        />
        <TagEditor
          label="Colunas Secundárias"
          description="Colunas opcionais. Elas também entram na ordenação unificada da tabela acima."
          tags={secondaryColumns}
          onChange={setSecondaryColumns}
        />
        <TagEditor
          label="Eventos Principais"
          description="Tipos de event_name considerados importantes. Destacados em azul nas visualizações."
          tags={keyEvents}
          onChange={setKeyEvents}
        />
      </div>
    </div>
  )
}
