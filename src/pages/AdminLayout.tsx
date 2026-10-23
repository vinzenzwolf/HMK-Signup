import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ROLE_LABELS, useAdminRoles, type AdminRole } from '../lib/adminRoles'
import './SignupPage.css'
import './AdminDashboard.css'
import './AdminLayout.css'

const ADMIN_PAGES: Array<{ path: string; label: string; title: string; subtitle: string; role: AdminRole }> = [
  { path: '/admin', label: 'Anmeldungen', title: 'Anmeldungen Dashboard', subtitle: 'Übersicht aller Anmeldungen und Statistiken', role: 'registrations' },
  { path: '/admin/helfer', label: 'Helfer', title: 'Helferanmeldung', subtitle: 'Helferformular und Anmeldungen pro Wettkampf', role: 'helpers' },
  { path: '/admin/system', label: 'Systemadmin', title: 'Systemadmin', subtitle: 'Status der Dienste, Logins und Berechtigungen', role: 'system' },
]

// Shows the page only for users with the given role, otherwise redirects to the first allowed page
export function RequireRole({ role, children }: { role: AdminRole; children: React.ReactNode }) {
  const { hasRole } = useAdminRoles()
  if (hasRole(role)) return <>{children}</>
  const fallback = ADMIN_PAGES.find((page) => hasRole(page.role))
  return fallback ? <Navigate to={fallback.path} replace /> : null
}

function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { roles, email, hasRole } = useAdminRoles()
  const allowedPages = ADMIN_PAGES.filter((page) => hasRole(page.role))
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
            {allowedPages.length > 1 && (
              <nav className="admin-nav" aria-label="Admin-Bereiche">
                {allowedPages.map((page) => (
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
            )}
            <button onClick={handleLogout} className="admin-logout-button">
              Abmelden
            </button>
          </div>
          <p className="admin-user-info">
            {email} · {roles.map((role) => ROLE_LABELS[role]).join(', ')}
          </p>
        </div>
      </div>

      <Outlet />
    </>
  )
}

export default AdminLayout
