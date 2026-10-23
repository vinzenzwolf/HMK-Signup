import { createContext, useContext } from 'react'

export type AdminRole = 'system' | 'registrations' | 'helpers'

export const ROLE_LABELS: Record<AdminRole, string> = {
  system: 'Systemadmin',
  registrations: 'Anmeldungsadmin',
  helpers: 'Helferadmin',
}

export type AdminRolesContextValue = {
  roles: AdminRole[]
  email: string | null
}

export const AdminRolesContext = createContext<AdminRolesContextValue>({ roles: [], email: null })

// Systemadmins haben jede Rolle – muss zu public.has_admin_role() in der Datenbank passen
export const hasRole = (roles: AdminRole[], role: AdminRole) => roles.includes('system') || roles.includes(role)

export function useAdminRoles() {
  const context = useContext(AdminRolesContext)
  return { ...context, hasRole: (role: AdminRole) => hasRole(context.roles, role) }
}
