import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import './SignupPage.css'
import Tag from '../components/Tag'
import SignUpForm from '../components/SignUpForm'
import InformationBanner from '../components/InformationBanner'
import { loadRegistrationByToken, mapAthleteToChild } from '../lib/database'
import type { Child } from '../types/child'

function SignupPage() {
  const { token } = useParams<{ token?: string }>()
  const [isLoading, setIsLoading] = useState(!!token)
  const [error, setError] = useState<string | null>(null)
  const [initialData, setInitialData] = useState<{
    registrationId?: string
    trainerName: string
    verein: string
    email: string
    phoneNumber: string
    children: Child[]
  } | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const registration = await loadRegistrationByToken(token)
        
        if (!registration) {
          setError('Anmeldung nicht gefunden. Bitte überprüfen Sie den Link.')
          setIsLoading(false)
          return
        }

        setInitialData({
          registrationId: registration.id,
          trainerName: registration.guardian_name,
          verein: registration.club || '',
          email: registration.email,
          phoneNumber: registration.phone,
          children: registration.athletes.map(mapAthleteToChild),
        })
      } catch (err) {
        console.error('Error loading registration:', err)
        setError('Fehler beim Laden der Anmeldung. Bitte versuchen Sie es erneut.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [token])

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Lade Anmeldung...</p>
      </div>
    )
  }

  return (
    <>
      <div className="title">
        <Tag>2027</Tag>
        <h1>Anmeldung SCL Hallenmehrkampf</h1>
        <p>Anmeldeformular für Vereine</p>
        <div className="tags">
          <Tag>Kategorien: U10, U12, U14</Tag>
          <Tag>Anmeldefrist: 15.01.2027</Tag>
        </div>
      </div>

      <div className='form'>
        {error && (
          <InformationBanner message={error} variant="error" />
        )}
        <SignUpForm
          initialData={initialData || undefined}
          editToken={token}
          onSaveSuccess={() => {
            // Bei Bearbeitung: auf der Seite bleiben, damit der editToken erhalten bleibt
          }}
        />
      </div>
    </>
  )
}

export default SignupPage