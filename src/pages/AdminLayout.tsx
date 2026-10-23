import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './SignupPage.css'
import './AdminDashboard.css'
import './AdminLayout.css'

const ADMIN_PAGES = [
  { path: '/admin', label: 'Anmeldungen', title: 'Anmeldungen Dashboard', subtitle: 'Übersicht aller Anmeldungen und Statistiken' },
  { path: '/admin/helfer', label: 'Helfer', title: 'Helferanmeldung', subtitle: 'Schichten und Helfer für den Wettkampftag' },
  { path: '/admin/system', label: 'Systemadmin', title: 'Systemadmin', subtitle: 'Status und Verknüpfungen aller Dienste' },
]

function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentPage =
    ADMIN_PAGES.find((page) => page.path !== '/admin' && location.pathname.startsWith(page.path)) ?? ADMIN_PAGES[0]

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  return (
    <>
      <div className="title">
        <div className="admin-title-container">
          <div className="admin-title-content">
            <h1 className="admin-title-h1">{currentPage.title}</h1>
            <p className="admin-title-p">{currentPage.subtitle}</p>
          </div>
          <div className="admin-nav-bar">
            <nav className="admin-nav" aria-label="Admin-Bereiche">
              {ADMIN_PAGES.map((page) => (
                <NavLink
                  key={page.path}
                  to={page.path}
                  end={page.path === '/admin'}
                  className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`}
                >
                  {page.label}
                </NavLink>
              ))}
            </nav>
            <button onClick={handleLogout} className="admin-logout-button">
              Abmelden
            </button>
          </div>
        </div>
      </div>

      <Outlet />
    </>
  )
}

export default AdminLayout
