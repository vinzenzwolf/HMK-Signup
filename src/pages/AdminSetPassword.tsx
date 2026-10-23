import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import InformationBanner from '../components/InformationBanner'
import FormField from '../components/FormField'
import './SignupPage.css'

const MIN_PASSWORD_LENGTH = 10

// Landing page for invite and reset links from the admin-users edge function
function AdminSetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  // One-time tokens must only be redeemed once (React StrictMode runs effects twice in dev)
  const hasVerified = useRef(false)

  useEffect(() => {
    if (hasVerified.current) return
    hasVerified.current = true
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')

    async function verify() {
      if (tokenHash && (type === 'invite' || type === 'recovery')) {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (verifyError || !data.user) {
          setError('Der Link ist ungültig oder abgelaufen. Bitte fordern Sie beim Systemadmin einen neuen Link an.')
        } else {
          setEmail(data.user.email ?? null)
          // Remove the one-time token from the address bar
          navigate('/admin/passwort', { replace: true })
        }
      } else {
        const { data } = await supabase.auth.getUser()
        if (data.user) {
          setEmail(data.user.email ?? null)
        } else {
          setError('Kein gültiger Link. Bitte öffnen Sie den Link aus der E-Mail erneut.')
        }
      }
      setIsVerifying(false)
    }

    verify()
    // Only run once for the link that was opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`)
      return
    }
    if (password !== passwordRepeat) {
      setError('Die Passwörter stimmen nicht überein.')
      return
    }

    setIsSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setIsSaving(false)
    if (updateError) {
      setError(`Passwort konnte nicht gespeichert werden: ${updateError.message}`)
      return
    }
    navigate('/admin', { replace: true })
  }

  return (
    <>
      <div className="title">
        <h1>Passwort festlegen</h1>
        <p>{email ? `Für ${email}` : 'Admin-Bereich SCL Hallenmehrkampf'}</p>
      </div>
      <div className="form">
        {isVerifying ? (
          <p>Link wird geprüft…</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ maxWidth: '500px', margin: '0 auto', width: '100%' }}>
            {error && <InformationBanner message={error} variant="error" />}
            {email && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <FormField
                  id="new-password"
                  name="new-password"
                  label={`Neues Passwort (mind. ${MIN_PASSWORD_LENGTH} Zeichen)`}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <FormField
                  id="new-password-repeat"
                  name="new-password-repeat"
                  label="Passwort wiederholen"
                  type="password"
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '0.9rem 1.5rem',
                    backgroundColor: '#4C1D95',
                    color: 'white',
                    border: 'none',
                    borderRadius: '16px',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    opacity: isSaving ? 0.5 : 1,
                  }}
                >
                  {isSaving ? 'Wird gespeichert…' : 'Passwort speichern'}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </>
  )
}

export default AdminSetPassword
