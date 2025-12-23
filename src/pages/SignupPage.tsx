import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './SignupPage.css'
import Tag from '../components/Tag'
import SignUpForm from '../components/SignUpForm'
import InformationBanner from '../components/InformationBanner'
import { loadActiveSeason, loadRegistrationByToken, loadSeasonByYear, loadSeasonById, mapAthleteToChild } from '../lib/database'
import type { Child } from '../types/child'
import type { Season } from '../lib/database'

function SignupPage() {
  const { token, year } = useParams<{ token?: string; year?: string }>()
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [initialData, setInitialData] = useState<{
    registrationId?: string
    trainerName: string
    verein: string
    email: string
    phoneNumber: string
    children: Child[]
  } | null>(null)
  const [season, setSeason] = useState<Season | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        // 1) Load season (by URL year or active)
        const yearNumber = year ? parseInt(year, 10) : undefined
        if (year && (Number.isNaN(yearNumber) || `${yearNumber}` !== year)) {
          setNotFound(true)
          setIsLoading(false)
          return
        }

        let seasonData = yearNumber
          ? await loadSeasonByYear(yearNumber)
          : await loadActiveSeason()

        // 2) If edit token, load existing registration
        if (token) {
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

          // Align season with the registration's season if available
          if (registration.season_id) {
            if (!seasonData || seasonData.id !== registration.season_id) {
              const seasonById = await loadSeasonById(registration.season_id)
              seasonData = seasonById ?? seasonData
            }
          }
        }

        if (!seasonData) {
          if (year) {
            setNotFound(true)
          } else {
            setError('Keine aktive Saison gefunden. Bitte Admin kontaktieren.')
          }
          setIsLoading(false)
          return
        }

        // Prüfe, ob die Saison aktiv ist
        if (!seasonData.is_active) {
          setError('Diese Saison ist nicht mehr verfügbar. Bitte Admin kontaktieren.')
          setIsLoading(false)
          return
        }

        // Wenn kein Jahr in der URL ist und kein Token vorhanden ist, weiterleiten zur neuesten aktiven Saison
        if (!year && !token && seasonData) {
          navigate(`/${seasonData.year}`, { replace: true })
          return
        }

        setSeason(seasonData)
      } catch (err) {
        console.error('Error loading registration:', err)
        setError('Fehler beim Laden der Anmeldung. Bitte versuchen Sie es erneut.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [token, year, navigate])

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Lade Anmeldung...</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <h1>404</h1>
        <p>Die angeforderte Seite wurde nicht gefunden.</p>
      </div>
    )
  }

  return (
    <>
      <div className="title">
        <Tag>{season ? String(season.year) : '----'}</Tag>
        <h1>Anmeldung SCL Hallenmehrkampf</h1>
        <p>Anmeldeformular für Vereine</p>
        <div className="tags">
          <Tag>{`Wettkampfdatum: ${season ? formatDate(season.event_date) : '--.--.----'}`}</Tag>
          <Tag>{`Anmeldefrist: ${season ? formatDate(season.signup_deadline) : '--.--.----'}`}</Tag>
          <Tag>{`Zahlungsfrist: ${season ? formatDate(season.payment_deadline) : '--.--.----'}`}</Tag>
        </div>
      </div>

      <div className='form'>
        {error && (
          <InformationBanner message={error} variant="error" />
        )}
        <SignUpForm
          initialData={initialData || undefined}
          editToken={token}
          seasonId={season?.id}
          seasonYear={season?.year}
          seasonPaymentDeadline={season?.payment_deadline}
          onSaveSuccess={() => {
            // Bei Bearbeitung: auf der Seite bleiben, damit der editToken erhalten bleibt
          }}
        />
      </div>
    </>
  )
}

export default SignupPage