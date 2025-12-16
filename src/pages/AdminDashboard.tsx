import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import InformationBanner from '../components/InformationBanner'
import './SignupPage.css'
import './AdminDashboard.css'

type Athlete = {
  id: string
  first_name: string
  last_name: string
  birth_year: number
  gender: 'm' | 'w'
}

type Registration = {
  id: string
  guardian_name: string
  club: string | null
  email: string
  phone: string
  created_at: string
  edit_token: string | null
  athletes: Athlete[]
}

type Statistics = {
  totalRegistrations: number
  totalAthletes: number
  uniqueClubs: number
  athletesByGender: { m: number; w: number }
  athletesByYear: Record<number, number>
  clubs: Array<{ name: string; count: number }>
}

function AdminDashboard() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [editingRegistrationId, setEditingRegistrationId] = useState<string | null>(null)
  const [statistics, setStatistics] = useState<Statistics | null>(null)
  const [deletedRegistration, setDeletedRegistration] = useState<Registration | null>(null)
  const [deleteTimer, setDeleteTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadRegistrations()
  }, [])

  useEffect(() => {
    if (registrations.length > 0) {
      calculateStatistics()
    }
  }, [registrations])

  useEffect(() => {
    filterRegistrations()
  }, [searchQuery, registrations])


  function filterRegistrations() {
    if (!searchQuery.trim()) {
      setFilteredRegistrations(registrations)
      return
    }

    const query = searchQuery.toLowerCase().trim()
    const filtered = registrations.filter(reg => {
      // Search in registration fields
      const matchesGuardian = reg.guardian_name.toLowerCase().includes(query)
      const matchesClub = reg.club?.toLowerCase().includes(query) || false
      const matchesEmail = reg.email.toLowerCase().includes(query)
      const matchesPhone = reg.phone.toLowerCase().includes(query)
      
      // Search in athletes
      const matchesAthlete = reg.athletes.some(athlete => 
        athlete.first_name.toLowerCase().includes(query) ||
        athlete.last_name.toLowerCase().includes(query) ||
        athlete.birth_year.toString().includes(query)
      )

      return matchesGuardian || matchesClub || matchesEmail || matchesPhone || matchesAthlete
    })

    setFilteredRegistrations(filtered)
  }

  function calculateStatistics() {
    const totalRegistrations = registrations.length
    const totalAthletes = registrations.reduce((sum, reg) => sum + reg.athletes.length, 0)
    const clubs = new Map<string, number>()
    const athletesByGender = { m: 0, w: 0 }
    const athletesByYear: Record<number, number> = {}

    registrations.forEach(reg => {
      if (reg.club) {
        clubs.set(reg.club, (clubs.get(reg.club) || 0) + 1)
      }
      reg.athletes.forEach(athlete => {
        if (athlete.gender === 'm') athletesByGender.m++
        if (athlete.gender === 'w') athletesByGender.w++
        athletesByYear[athlete.birth_year] = (athletesByYear[athlete.birth_year] || 0) + 1
      })
    })

    const clubsArray = Array.from(clubs.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    setStatistics({
      totalRegistrations,
      totalAthletes,
      uniqueClubs: clubs.size,
      athletesByGender,
      athletesByYear,
      clubs: clubsArray,
    })
  }

  async function loadRegistrations() {
    try {
      setIsLoading(true)
      const { data, error: fetchError } = await supabase
        .from('registrations')
        .select(`
          id,
          guardian_name,
          club,
          email,
          phone,
          created_at,
          edit_token,
          athletes (
            id,
            first_name,
            last_name,
            birth_year,
            gender
          )
        `)
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw new Error(`Fehler beim Laden: ${fetchError.message}`)
      }

      const transformed = (data || []).map((reg: any) => ({
        id: reg.id,
        guardian_name: reg.guardian_name,
        club: reg.club,
        email: reg.email,
        phone: reg.phone,
        created_at: reg.created_at,
        edit_token: reg.edit_token,
        athletes: Array.isArray(reg.athletes) ? reg.athletes : [],
      }))

      setRegistrations(transformed)
      setFilteredRegistrations(transformed)
    } catch (err) {
      console.error('Error loading registrations:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Anmeldungen')
    } finally {
      setIsLoading(false)
    }
  }

  function isNonEmpty(value: string) {
    return value.trim().length > 0
  }

  function isValidEmail(value: string) {
    return /^\S+@\S+\.\S+$/.test(value)
  }

  function isValidPhoneNumber(value: string): boolean {
    const phone = value.trim()
    // + gefolgt von 7–15 Ziffern, Leerzeichen erlaubt
    const phoneRegex = /^\+\d(?:[\d\s]{6,14}\d)$/
    return phoneRegex.test(phone)
  }

  function isDuplicate(athlete: Athlete, allAthletes: Athlete[]): boolean {
    const normalizedFirstName = athlete.first_name.trim().toLowerCase()
    const normalizedLastName = athlete.last_name.trim().toLowerCase()
    
    if (!normalizedFirstName || !normalizedLastName) {
      return false // Leere Felder sind keine Duplikate
    }
    
    // Zähle, wie viele Athleten denselben Namen haben (außer dem aktuellen)
    const duplicates = allAthletes.filter(a => 
      a.id !== athlete.id &&
      a.first_name.trim().toLowerCase() === normalizedFirstName &&
      a.last_name.trim().toLowerCase() === normalizedLastName
    )
    
    return duplicates.length > 0
  }

  async function handleAddAthlete(regId: string) {
    const registration = registrations.find(r => r.id === regId)
    if (!registration) return

    // Add a new empty athlete to the registration
    const newAthlete: Athlete = {
      id: crypto.randomUUID(),
      first_name: '',
      last_name: '',
      birth_year: new Date().getFullYear(),
      gender: 'm',
    }

    const newRegs = registrations.map(r =>
      r.id === regId
        ? { ...r, athletes: [...r.athletes, newAthlete] }
        : r
    )
    setRegistrations(newRegs)
  }

  async function handleDeleteAthlete(regId: string, athleteId: string) {
    if (!confirm('Möchten Sie diesen Athleten wirklich löschen?')) {
      return
    }

    try {
      // Save current edit mode state
      const wasEditing = editingRegistrationId === regId

      // Delete from database
      const { error } = await supabase
        .from('athletes')
        .delete()
        .eq('id', athleteId)

      if (error) throw error

      // Remove from local state immediately
      const newRegs = registrations.map(r =>
        r.id === regId
          ? { ...r, athletes: r.athletes.filter(a => a.id !== athleteId) }
          : r
      )
      setRegistrations(newRegs)

      setSuccessMessage('Athlet erfolgreich gelöscht!')
      setTimeout(() => setSuccessMessage(null), 3000)
      
      // Reload from database to ensure consistency
      await loadRegistrations()
      
      // Restore edit mode if it was active
      if (wasEditing) {
        setEditingRegistrationId(regId)
      }
    } catch (err) {
      console.error('Error deleting athlete:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen des Athleten')
    }
  }

  async function handleSaveRegistrationChanges(regId: string) {
    const registration = registrations.find(r => r.id === regId)
    if (!registration) return

    // Validate registration fields
    const errors: string[] = []

    if (!isNonEmpty(registration.guardian_name)) {
      errors.push('Trainer/in Name darf nicht leer sein')
    }

    if (!isValidEmail(registration.email)) {
      errors.push('E-Mail-Adresse ist ungültig')
    }

    if (!isValidPhoneNumber(registration.phone)) {
      errors.push('Telefonnummer ist ungültig (Format: +41... mit 7-15 Ziffern)')
    }

    // Validate athletes
    for (const athlete of registration.athletes) {
      if (!isNonEmpty(athlete.first_name)) {
        errors.push(`Vorname des Athleten "${athlete.last_name || 'unbekannt'}" darf nicht leer sein`)
      }

      if (!isNonEmpty(athlete.last_name)) {
        errors.push(`Nachname des Athleten "${athlete.first_name || 'unbekannt'}" darf nicht leer sein`)
      }

      if (!/^\d{4}$/.test(athlete.birth_year.toString())) {
        errors.push(`Jahrgang des Athleten "${athlete.first_name} ${athlete.last_name}" muss 4 Ziffern haben`)
      }

      if (athlete.gender !== 'm' && athlete.gender !== 'w') {
        errors.push(`Geschlecht des Athleten "${athlete.first_name} ${athlete.last_name}" muss M oder W sein`)
      }

      if (isDuplicate(athlete, registration.athletes)) {
        errors.push(`Athlet "${athlete.first_name} ${athlete.last_name}" existiert bereits (Duplikat)`)
      }
    }

    if (errors.length > 0) {
      setError('Bitte korrigiere die folgenden Fehler:\n' + errors.join('\n'))
      return
    }

    try {
      // Clear any previous errors before attempting to save
      setError(null)
      
      // Save registration fields
      const { error: regError } = await supabase
        .from('registrations')
        .update({
          guardian_name: registration.guardian_name,
          club: registration.club || null,
          email: registration.email,
          phone: registration.phone,
        })
        .eq('id', regId)

      if (regError) throw regError

      // Save all athlete changes
      for (const athlete of registration.athletes) {
        const { error: athleteError } = await supabase
          .from('athletes')
          .update({
            first_name: athlete.first_name,
            last_name: athlete.last_name,
            birth_year: athlete.birth_year,
            gender: athlete.gender,
          })
          .eq('id', athlete.id)

        if (athleteError) throw athleteError
      }

      // Success - clear error and show success message
      setError(null)
      setSuccessMessage('Anmeldung erfolgreich aktualisiert!')
      setTimeout(() => setSuccessMessage(null), 3000)
      await loadRegistrations()
      setEditingRegistrationId(null)
    } catch (err) {
      console.error('Error saving registration changes:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    }
  }

  async function handleDeleteRegistration(regId: string) {
    if (!confirm('Möchten Sie diese Anmeldung wirklich löschen? Alle zugehörigen Athleten werden ebenfalls gelöscht.')) {
      return
    }

    try {
      // Save the registration data before deleting (for undo)
      const registrationToDelete = registrations.find(r => r.id === regId)
      if (!registrationToDelete) {
        throw new Error('Anmeldung nicht gefunden')
      }

      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', regId)

      if (error) throw error

      // Store deleted registration for undo
      setDeletedRegistration(registrationToDelete)
      setSuccessMessage(null)
      setError(null)
      
      // Auto-hide the undo banner after 10 seconds
      const timer = setTimeout(() => {
        setDeletedRegistration(null)
        setDeleteTimer(null)
      }, 10000)
      setDeleteTimer(timer)
      
      await loadRegistrations()
    } catch (err) {
      console.error('Error deleting registration:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
      setDeletedRegistration(null)
      if (deleteTimer) {
        clearTimeout(deleteTimer)
        setDeleteTimer(null)
      }
    }
  }

  async function handleUndoDelete() {
    if (!deletedRegistration) return

    // Clear the auto-hide timer
    if (deleteTimer) {
      clearTimeout(deleteTimer)
      setDeleteTimer(null)
    }

    try {
      // Restore the registration
      const { error: regError } = await supabase
        .from('registrations')
        .insert({
          id: deletedRegistration.id,
          guardian_name: deletedRegistration.guardian_name,
          club: deletedRegistration.club,
          email: deletedRegistration.email,
          phone: deletedRegistration.phone,
          edit_token: deletedRegistration.edit_token,
        })

      if (regError) throw regError

      // Restore the athletes
      if (deletedRegistration.athletes.length > 0) {
        const athletesToInsert = deletedRegistration.athletes.map(athlete => ({
          id: athlete.id,
          registration_id: deletedRegistration.id,
          first_name: athlete.first_name,
          last_name: athlete.last_name,
          birth_year: athlete.birth_year,
          gender: athlete.gender,
        }))

        const { error: athletesError } = await supabase
          .from('athletes')
          .insert(athletesToInsert)

        if (athletesError) throw athletesError
      }

      setDeletedRegistration(null)
      if (deleteTimer) {
        clearTimeout(deleteTimer)
        setDeleteTimer(null)
      }
      setSuccessMessage('Anmeldung erfolgreich wiederhergestellt!')
      setTimeout(() => setSuccessMessage(null), 3000)
      await loadRegistrations()
    } catch (err) {
      console.error('Error undoing delete:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Wiederherstellen')
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString('de-CH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getEditLink(token: string | null) {
    if (!token) return null
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/edit/${token}`
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Lade Anmeldungen...</p>
      </div>
    )
  }

  return (
    <>
      <div className="title">
        <div className="admin-title-container">
          <div className="admin-title-content">
            <h1 className="admin-title-h1">
              Admin Dashboard
            </h1>
            <p className="admin-title-p">
              Übersicht aller Anmeldungen und Statistiken
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="admin-logout-button"
          >
            Abmelden
          </button>
        </div>
      </div>

      <div className="form">
        {/* Main Container with Statistics and Registrations */}
        <div className="admin-container">
          {/* Banners inside the main container */}
          {error && (
            <div className="admin-banner-wrapper">
              <InformationBanner message={error} variant="error" />
            </div>
          )}
          {successMessage && (
            <div className="admin-banner-wrapper">
              <InformationBanner message={successMessage} variant="success" />
            </div>
          )}
          {deletedRegistration && (
            <div className="admin-undo-banner">
              <span className="admin-undo-text">
                Anmeldung erfolgreich gelöscht. Trainer/in: {deletedRegistration.guardian_name}
              </span>
              <button
                onClick={handleUndoDelete}
                className="admin-undo-button"
              >
                Rückgängig machen
              </button>
            </div>
          )}
          {/* Statistics Section - First */}
          {statistics && (
            <div className="admin-section">
            <h2 className="admin-section-title">Statistiken</h2>
            <div className="admin-stats-grid">
              <div className="admin-stat-card admin-stat-card-blue">
                <div className="admin-stat-value admin-stat-value-blue">
                  {statistics.totalRegistrations}
                </div>
                <div className="admin-stat-label admin-stat-label-blue">Anmeldungen</div>
              </div>
              <div className="admin-stat-card admin-stat-card-green">
                <div className="admin-stat-value admin-stat-value-green">
                  {statistics.totalAthletes}
                </div>
                <div className="admin-stat-label admin-stat-label-green">Athleten</div>
              </div>
              <div className="admin-stat-card admin-stat-card-yellow">
                <div className="admin-stat-value admin-stat-value-yellow">
                  {statistics.uniqueClubs}
                </div>
                <div className="admin-stat-label admin-stat-label-yellow">Vereine</div>
              </div>
              <div className="admin-stat-card admin-stat-card-pink">
                <div className="admin-stat-value admin-stat-value-pink">
                  {statistics.athletesByGender.w}
                </div>
                <div className="admin-stat-label admin-stat-label-pink">Weiblich</div>
              </div>
              <div className="admin-stat-card admin-stat-card-indigo">
                <div className="admin-stat-value admin-stat-value-indigo">
                  {statistics.athletesByGender.m}
                </div>
                <div className="admin-stat-label admin-stat-label-indigo">Männlich</div>
              </div>
            </div>

            {/* Clubs List */}
            {statistics.clubs.length > 0 && (
              <div className="admin-clubs-list">
                <h3 className="admin-clubs-title">Vereine</h3>
                <div className="admin-clubs-grid">
                  {statistics.clubs.map((club, index) => (
                    <div key={index} className="admin-club-badge">
                      <span className="admin-club-name">{club.name}</span>
                      <span className="admin-club-count">{club.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
          )}

          {/* Divider */}
          {statistics && <div className="admin-divider" />}

          {/* Registrations List with integrated search */}
          {/* Header with search integrated */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem', fontWeight: 700 }}>
                Anmeldungen {searchQuery ? `(${filteredRegistrations.length} von ${registrations.length})` : `(${registrations.length})`}
              </h2>
              <button
                onClick={loadRegistrations}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#4C1D95',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#5b21b6'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4C1D95'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                Aktualisieren
              </button>
            </div>
            
            {/* Search bar integrated */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Suchen nach Trainer, Verein, E-Mail, Telefon oder Athlet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '1rem 1rem 1rem 3rem',
                  borderRadius: '14px',
                  border: '2px solid #e2e8f0',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  backgroundColor: '#f8fafc',
                  color: '#0f172a',
                  transition: 'all 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#4C1D95'
                  e.target.style.backgroundColor = '#ffffff'
                  e.target.style.boxShadow = '0 0 0 3px rgba(76, 29, 149, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0'
                  e.target.style.backgroundColor = '#f8fafc'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <span style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                fontSize: '1.25rem',
              }}>
                🔍
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '1rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    fontSize: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9'
                    e.currentTarget.style.color = '#0f172a'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = '#64748b'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {filteredRegistrations.length === 0 ? (
            <div className="admin-empty-state">
              <div className="admin-empty-icon">🔍</div>
              <p className="admin-empty-text">
                {searchQuery ? 'Keine Anmeldungen gefunden.' : 'Noch keine Anmeldungen vorhanden.'}
              </p>
            </div>
          ) : (
            <div className="admin-registrations-list">
              {filteredRegistrations.map((reg) => {
                const isEditingRegistration = editingRegistrationId === reg.id
                return (
                  <div key={reg.id} className="admin-registration-card">
                    {/* Registration Header */}
                    <div className="admin-registration-header">
                      <div className="admin-registration-fields">
                      <div className="admin-registration-field">
                        <strong className="admin-label">
                          Trainer/in
                        </strong>
                        {isEditingRegistration ? (
                          <input
                            type="text"
                            value={reg.guardian_name}
                            onChange={(e) => {
                              const newRegs = registrations.map(r => 
                                r.id === reg.id ? { ...r, guardian_name: e.target.value } : r
                              )
                              setRegistrations(newRegs)
                            }}
                            className="admin-input"
                          />
                        ) : (
                          <span className="admin-text">
                            {reg.guardian_name}
                          </span>
                        )}
                      </div>
                      <div className="admin-registration-field">
                        <strong className="admin-label">
                          Verein
                        </strong>
                        {isEditingRegistration ? (
                          <input
                            type="text"
                            value={reg.club || ''}
                            onChange={(e) => {
                              const newRegs = registrations.map(r => 
                                r.id === reg.id ? { ...r, club: e.target.value } : r
                              )
                              setRegistrations(newRegs)
                            }}
                            className="admin-input"
                          />
                        ) : (
                          <span className="admin-text">
                            {reg.club || '-'}
                          </span>
                        )}
                      </div>
                      <div className="admin-registration-field">
                        <strong className="admin-label">
                          E-Mail
                        </strong>
                        {isEditingRegistration ? (
                          <input
                            type="email"
                            value={reg.email}
                            onChange={(e) => {
                              const newRegs = registrations.map(r => 
                                r.id === reg.id ? { ...r, email: e.target.value } : r
                              )
                              setRegistrations(newRegs)
                            }}
                            className="admin-input"
                          />
                        ) : (
                          <span className="admin-text">
                            {reg.email}
                          </span>
                        )}
                      </div>
                      <div className="admin-registration-field">
                        <strong className="admin-label">
                          Telefon
                        </strong>
                        {isEditingRegistration ? (
                          <input
                            type="text"
                            value={reg.phone}
                            onChange={(e) => {
                              const newRegs = registrations.map(r => 
                                r.id === reg.id ? { ...r, phone: e.target.value } : r
                              )
                              setRegistrations(newRegs)
                            }}
                            className="admin-input"
                          />
                        ) : (
                          <span className="admin-text">
                            {reg.phone}
                          </span>
                        )}
                      </div>
                      <div className="admin-registration-field">
                        <strong className="admin-date-label">
                          Erstellt am
                        </strong>
                        <span className="admin-date-value">{formatDate(reg.created_at)}</span>
                      </div>
                    </div>
                    <div className="admin-registration-actions">
                      <button
                        onClick={() => {
                          if (isEditingRegistration) {
                            handleSaveRegistrationChanges(reg.id)
                          } else {
                            setError(null)
                            setEditingRegistrationId(reg.id)
                          }
                        }}
                        className={`admin-edit-button ${isEditingRegistration ? 'admin-edit-button-active' : 'admin-edit-button-inactive'}`}
                      >
                        {isEditingRegistration ? 'Bearbeitung beenden' : 'Bearbeiten'}
                      </button>
                      <button
                        onClick={() => handleDeleteRegistration(reg.id)}
                        className="admin-delete-button"
                      >
                        Löschen
                      </button>
                    </div>
                  </div>

                  {/* Athletes List */}
                  <div className="admin-athletes-section">
                    <div className="admin-athletes-header">
                      <strong className="admin-athletes-title">
                        Athleten ({reg.athletes.length})
                      </strong>
                      {isEditingRegistration && (
                        <button
                          onClick={() => handleAddAthlete(reg.id)}
                          className="admin-button admin-button-secondary admin-add-athlete-button"
                        >
                          + Athlet hinzufügen
                        </button>
                      )}
                    </div>
                    {reg.athletes.length === 0 ? (
                      <p className="admin-empty-athletes">Keine Athleten</p>
                    ) : (
                      <div className="admin-athletes-list">
                        {reg.athletes.map((athlete) => (
                          <div key={athlete.id} className="admin-athlete-card">
                            <div className="admin-athlete-field">
                              <strong className="admin-label-small">
                                Vorname
                              </strong>
                        {isEditingRegistration ? (
                                <input
                                  type="text"
                                  value={athlete.first_name}
                                  onChange={(e) => {
                                    const newRegs = registrations.map(r => ({
                                      ...r,
                                      athletes: r.athletes.map(a => 
                                        a.id === athlete.id ? { ...a, first_name: e.target.value } : a
                                      )
                                    }))
                                    setRegistrations(newRegs)
                                  }}
                                  className="admin-input"
                                />
                        ) : (
                          <span className="admin-text" style={{ fontSize: '0.875rem' }}>
                            {athlete.first_name}
                          </span>
                        )}
                            </div>
                            <div className="admin-athlete-field">
                              <strong className="admin-label-small">
                                Nachname
                              </strong>
                        {isEditingRegistration ? (
                                <input
                                  type="text"
                                  value={athlete.last_name}
                                  onChange={(e) => {
                                    const newRegs = registrations.map(r => ({
                                      ...r,
                                      athletes: r.athletes.map(a => 
                                        a.id === athlete.id ? { ...a, last_name: e.target.value } : a
                                      )
                                    }))
                                    setRegistrations(newRegs)
                                  }}
                                  className="admin-input"
                                />
                        ) : (
                          <span className="admin-text" style={{ fontSize: '0.875rem' }}>
                            {athlete.last_name}
                          </span>
                        )}
                            </div>
                            <div className="admin-athlete-field">
                              <strong className="admin-label-small">
                                Jahrgang
                              </strong>
                        {isEditingRegistration ? (
                                <input
                                  type="number"
                                  value={athlete.birth_year}
                                  onChange={(e) => {
                                    const newRegs = registrations.map(r => ({
                                      ...r,
                                      athletes: r.athletes.map(a => 
                                        a.id === athlete.id ? { ...a, birth_year: parseInt(e.target.value) || 0 } : a
                                      )
                                    }))
                                    setRegistrations(newRegs)
                                  }}
                                  className="admin-input"
                                />
                        ) : (
                          <span className="admin-text" style={{ fontSize: '0.875rem' }}>
                            {athlete.birth_year}
                          </span>
                        )}
                          </div>
                          <div className="admin-athlete-field">
                            <strong className="admin-label-small">
                              Geschlecht
                            </strong>
                            {isEditingRegistration ? (
                              <select
                                value={athlete.gender}
                                onChange={(e) => {
                                  const newRegs = registrations.map(r => ({
                                    ...r,
                                    athletes: r.athletes.map(a => 
                                      a.id === athlete.id ? { ...a, gender: e.target.value as 'm' | 'w' } : a
                                    )
                                  }))
                                  setRegistrations(newRegs)
                                }}
                                className="admin-select"
                              >
                                <option value="m">Männlich</option>
                                <option value="w">Weiblich</option>
                              </select>
                            ) : (
                              <span className="admin-text" style={{ fontSize: '0.875rem' }}>
                                {athlete.gender === 'm' ? 'Männlich' : 'Weiblich'}
                              </span>
                            )}
                          </div>
                          {isEditingRegistration && (
                            <div className="admin-athlete-field">
                              <strong className="admin-label-small admin-label-hidden">
                                Aktion
                              </strong>
                              <button
                                onClick={() => handleDeleteAthlete(reg.id, athlete.id)}
                                className="admin-button admin-button-secondary admin-delete-athlete-button"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Edit Link */}
                  {reg.edit_token && (
                    <div className="admin-edit-link-section">
                      <strong className="admin-edit-link-title">
                        Bearbeitungslink:
                      </strong>
                      <a
                        href={getEditLink(reg.edit_token) || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-edit-link"
                      >
                        {getEditLink(reg.edit_token)}
                      </a>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default AdminDashboard
