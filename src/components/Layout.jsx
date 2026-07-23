import { Outlet, NavLink } from 'react-router-dom'
import { Upload, FolderOpen, Table2, Search, Settings } from 'lucide-react'
import { useStore } from '../store/useStore'

const NAV = [
  { to: '/upload', icon: Upload, label: 'Upload BigQuery' },
  { to: '/files', icon: FolderOpen, label: 'Arquivos' },
  { to: '/data', icon: Table2, label: 'Dados' },
  { to: '/investigation', icon: Search, label: 'Investigação' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
]

export default function Layout() {
  const { files, selectedFileIds } = useStore()

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-5 border-b border-gray-800">
          <h1 className="text-lg font-bold text-blue-400 leading-tight">eHub Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">Mobile Analytics Viewer</p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-1">
          <p className="text-xs text-gray-600">{files.length} arquivo(s) carregado(s)</p>
          <p className="text-xs text-gray-600">
            {selectedFileIds.length} selecionado(s) para análise
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
