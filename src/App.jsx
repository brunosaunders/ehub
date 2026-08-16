import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import UploadPage from './pages/UploadPage'
import FilesPage from './pages/FilesPage'
import DataTablePage from './pages/DataTablePage'
import InvestigationPage from './pages/InvestigationPage'
import HolisticViewPage from './pages/HolisticViewPage'
import SettingsPage from './pages/SettingsPage'
import DashboardPage from './pages/DashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/upload" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="data" element={<DataTablePage />} />
          <Route path="investigation" element={<InvestigationPage />} />
          <Route path="holistic" element={<HolisticViewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
