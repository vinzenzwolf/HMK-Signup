import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SignupPage from './pages/SignupPage'
import HelperSignupPage from './pages/HelperSignupPage'
import AdminLogin from './pages/AdminLogin'
import AdminLayout, { RequireRole } from './pages/AdminLayout'
import AdminSetPassword from './pages/AdminSetPassword'
import AdminDashboard from './pages/AdminDashboard'
import AdminHelfer from './pages/AdminHelfer'
import AdminSystem from './pages/AdminSystem'
import AdminBroadcast from './pages/AdminBroadcast'
import Impressum from './pages/Impressum'
import ProtectedRoute from './components/ProtectedRoute'
import NotFound from './pages/NotFound'
import Footer from './components/Footer'
import SiteHeader from './components/SiteHeader'

function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <SiteHeader />
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/impressum" element={<Impressum />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/passwort" element={<AdminSetPassword />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<RequireRole role="registrations"><AdminDashboard /></RequireRole>} />
              <Route path="helfer" element={<RequireRole role="helpers"><AdminHelfer /></RequireRole>} />
              <Route path="broadcast" element={<RequireRole role="broadcast"><AdminBroadcast /></RequireRole>} />
              <Route path="system" element={<RequireRole role="system"><AdminSystem /></RequireRole>} />
            </Route>
            <Route path="/helfer" element={<HelperSignupPage />} />
            <Route path="/:year/helfer" element={<HelperSignupPage />} />
            <Route path="/:year/edit/:token" element={<SignupPage />} />
            <Route path="/:year" element={<SignupPage />} />
            <Route path="/" element={<SignupPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  )
}

export default App
