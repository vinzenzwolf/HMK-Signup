import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import InformationBanner from '../components/InformationBanner'
import FormField from '../components/FormField'
import './SignupPage.css'

function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError('Ungültige Anmeldedaten. Bitte versuchen Sie es erneut.')
        return
      }

      if (data.user) {
        navigate('/admin')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="title">
        <h1>Admin Anmeldung</h1>
        <p>Bitte melden Sie sich an, um auf den Admin-Bereich zuzugreifen</p>
      </div>
      <div className="form">
        <form onSubmit={handleSubmit} style={{ maxWidth: '500px', margin: '0 auto' }}>
          {error && (
            <InformationBanner message={error} variant="error" />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField
              id="email"
              name="email"
              label="E-Mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
            />
            <FormField
              id="password"
              name="password"
              label="Passwort"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '0.9rem 1.5rem',
                backgroundColor: '#4C1D95',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.5 : 1,
              }}
            >
              {isLoading ? 'Wird angemeldet...' : 'Anmelden'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

export default AdminLogin

