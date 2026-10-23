import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SignupPage from './pages/SignupPage'
import AdminLogin from './pages/AdminLogin'
import AdminLayout from './pages/AdminLayout'
import AdminDashboard from './pages/AdminDashboard'
import AdminHelfer from './pages/AdminHelfer'
import AdminSystem from './pages/AdminSystem'
import Impressum from './pages/Impressum'
import ProtectedRoute from './components/ProtectedRoute'
import NotFound from './pages/NotFound'
import Footer from './components/Footer'

function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/impressum" element={<Impressum />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="helfer" element={<AdminHelfer />} />
              <Route path="system" element={<AdminSystem />} />
            </Route>
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
