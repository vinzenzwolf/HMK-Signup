import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AdminRolesContext, type AdminRole } from '../lib/adminRoles'
import type { User } from '@supabase/supabase-js'
import '../pages/AdminDashboard.css'

type ProtectedRouteProps = {
  children: React.ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Loads the admin roles for the given session user; roles are enforced again in the database
    const applySession = async (sessionUser: User | null) => {
      setUser(sessionUser)
      if (sessionUser) {
        const { data } = await supabase.rpc('my_admin_roles')
        setRoles((data as AdminRole[] | null) ?? [])
      } else {
        setRoles([])
      }
      setIsLoading(false)
    }

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => applySession(session?.user ?? null))

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Avoid awaiting Supabase calls inside the callback (can deadlock); token refreshes keep the roles
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(() => applySession(session?.user ?? null), 0)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Lade...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  if (roles.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h1>Kein Zugriff</h1>
        <p>Ihr Login ({user.email}) hat keine Berechtigung für den Admin-Bereich.</p>
        <button
          className="admin-logout-button"
          onClick={async () => {
            await supabase.auth.signOut()
            navigate('/admin/login')
          }}
        >
          Abmelden
        </button>
      </div>
    )
  }

  return (
    <AdminRolesContext.Provider value={{ roles, email: user.email ?? null }}>{children}</AdminRolesContext.Provider>
  )
}

export default ProtectedRoute
