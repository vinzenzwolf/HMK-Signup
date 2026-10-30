import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ROLE_LABELS, type AdminRole } from '../lib/adminRoles'
import InformationBanner from './InformationBanner'
import './UserManagement.css'

type ManagedUser = {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  confirmed: boolean
  roles: AdminRole[]
}

const ASSIGNABLE_ROLES: AdminRole[] = ['registrations', 'helpers', 'broadcast']

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'nie'

// Calls the admin-users edge function (system admins only) and unwraps error messages
async function callAdminUsers(body: Record<string, unknown>): Promise<{ users: ManagedUser[]; message?: string }> {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: { ...body, base_url: window.location.origin },
  })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      const errorBody = await (error.context as Response).json().catch(() => null)
      message = errorBody?.error ?? message
    }
    throw new Error(message)
  }
  return data
}

function UserManagement() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoles, setInviteRoles] = useState<AdminRole[]>(['registrations'])
  const [isInviting, setIsInviting] = useState(false)

  const run = useCallback(async (body: Record<string, unknown>) => {
    setError(null)
    setMessage(null)
    try {
      const result = await callAdminUsers(body)
      setUsers(result.users)
      if (result.message) setMessage(result.message)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }, [])

  useEffect(() => {
    if (!isExpanded) return
    callAdminUsers({ action: 'list' })
      .then((result) => setUsers(result.users))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setIsLoading(false))
  }, [isExpanded])

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault()
    setIsInviting(true)
    if (await run({ action: 'invite', email: inviteEmail.trim(), roles: inviteRoles })) {
      setInviteEmail('')
    }
    setIsInviting(false)
  }

  async function handleToggleRole(user: ManagedUser, role: AdminRole) {
    const roles = user.roles.includes(role) ? user.roles.filter((r) => r !== role) : [...user.roles, role]
    setBusyUserId(user.id)
    await run({ action: 'update_roles', user_id: user.id, roles })
    setBusyUserId(null)
  }

  async function handleAction(user: ManagedUser, action: 'send_reset' | 'delete') {
    setBusyUserId(user.id)
    await run({ action, user_id: user.id })
    setBusyUserId(null)
    setConfirmDeleteId(null)
  }

  return (
    <div className="admin-section">
      <div className="service-status-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h2 className="admin-section-title" style={{ margin: 0 }}>Logins & Berechtigungen</h2>
        <span
          style={{
            fontSize: '1.25rem',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </div>

      {isExpanded && (
        <div className="user-mgmt-body">
          {error && (
            <div className="admin-banner-wrapper">
              <InformationBanner message={error} variant="error" />
            </div>
          )}
          {message && (
            <div className="admin-banner-wrapper">
              <InformationBanner message={message} variant="success" />
            </div>
          )}

          <form className="user-mgmt-invite" onSubmit={handleInvite}>
            <h3 className="service-status-group-title">Neuen Login einladen</h3>
            <input
              type="email"
              className="admin-input"
              placeholder="name@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <div className="user-mgmt-roles">
              {ASSIGNABLE_ROLES.map((role) => (
                <label key={role} className="user-mgmt-role">
                  <input
                    type="checkbox"
                    checked={inviteRoles.includes(role)}
                    onChange={() =>
                      setInviteRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]))
                    }
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
            <div>
              <button
                type="submit"
                className="admin-refresh-button"
                disabled={isInviting || !inviteEmail.trim() || inviteRoles.length === 0}
              >
                {isInviting ? 'Sende Einladung…' : 'Einladung senden'}
              </button>
            </div>
            <p className="user-mgmt-hint">
              Die Person erhält eine E-Mail mit einem Link, über den sie ihr Passwort selbst festlegt.
            </p>
          </form>

          <h3 className="service-status-group-title">Logins ({users.length})</h3>
          {isLoading ? (
            <p>Lade Logins…</p>
          ) : (
            <div className="user-mgmt-list">
              {users.map((user) => {
                const isSystem = user.roles.includes('system')
                const isBusy = busyUserId === user.id
                return (
                  <div key={user.id} className={`user-mgmt-card${isBusy ? ' user-mgmt-card-busy' : ''}`}>
                    <div className="user-mgmt-card-header">
                      <div>
                        <div className="user-mgmt-email">{user.email}</div>
                        <div className="user-mgmt-meta">
                          {user.confirmed ? `Zuletzt angemeldet: ${formatDate(user.last_sign_in_at)}` : 'Einladung noch nicht angenommen'}
                        </div>
                      </div>
                      {isSystem && <span className="user-mgmt-badge">Systemadmin</span>}
                    </div>

                    {!isSystem && (
                      <>
                        <div className="user-mgmt-roles">
                          {ASSIGNABLE_ROLES.map((role) => (
                            <label key={role} className="user-mgmt-role">
                              <input
                                type="checkbox"
                                checked={user.roles.includes(role)}
                                disabled={isBusy}
                                onChange={() => handleToggleRole(user, role)}
                              />
                              {ROLE_LABELS[role]}
                            </label>
                          ))}
                          {user.roles.length === 0 && <span className="user-mgmt-warning">Kein Zugriff</span>}
                        </div>
                        <div className="user-mgmt-actions">
                          <button
                            className="admin-button admin-button-secondary"
                            disabled={isBusy}
                            onClick={() => handleAction(user, 'send_reset')}
                          >
                            {user.confirmed ? 'Passwort-Reset senden' : 'Einladung erneut senden'}
                          </button>
                          {confirmDeleteId === user.id ? (
                            <>
                              <button
                                className="admin-button admin-button-danger"
                                disabled={isBusy}
                                onClick={() => handleAction(user, 'delete')}
                              >
                                Login endgültig löschen
                              </button>
                              <button className="admin-button admin-button-secondary" onClick={() => setConfirmDeleteId(null)}>
                                Abbrechen
                              </button>
                            </>
                          ) : (
                            <button className="user-mgmt-delete" disabled={isBusy} onClick={() => setConfirmDeleteId(user.id)}>
                              Löschen
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default UserManagement
