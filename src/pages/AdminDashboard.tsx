import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import InformationBanner from '../components/InformationBanner'
import './SignupPage.css'
import './AdminDashboard.css'
import type { Season } from '../lib/database'

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
  season_id?: string | null
  athletes: Athlete[]
}

type Statistics = {
  totalRegistrations: number
  totalAthletes: number
  uniqueClubs: number
  athletesByGender: { m: number; w: number }
  athletesByCategory: {
    u10_m: number
    u10_w: number
    u12_m: number
    u12_w: number
    u14_m: number
    u14_w: number
  }
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
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null)
  const [isLoadingSeasons, setIsLoadingSeasons] = useState(true)
  const [showCreateSeason, setShowCreateSeason] = useState(false)
  const [isSeasonSelectExpanded, setIsSeasonSelectExpanded] = useState(true)
  const [isSeasonEditExpanded, setIsSeasonEditExpanded] = useState(true)
  const [isStatisticsExpanded, setIsStatisticsExpanded] = useState(true)
  const [isRegistrationsExpanded, setIsRegistrationsExpanded] = useState(true)
  const [expandedAthletes, setExpandedAthletes] = useState<Set<string>>(new Set())
  const [editSeasonForm, setEditSeasonForm] = useState({
    year: new Date().getFullYear(),
    event_date: '',
    event_number: 1,
    signup_deadline: '',
    payment_deadline: '',
  is_active: false,
  })
  const [seasonForm, setSeasonForm] = useState({
    year: new Date().getFullYear() + 1,
    event_date: '',
    event_number: 1,
    signup_deadline: '',
    payment_deadline: '',
    is_active: false,
  })
  const navigate = useNavigate()
  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) || null,
    [seasons, selectedSeasonId]
  )

  useEffect(() => {
    if (selectedSeason) {
      setEditSeasonForm({
        year: selectedSeason.year,
        event_date: selectedSeason.event_date,
        event_number: selectedSeason.event_number,
        signup_deadline: selectedSeason.signup_deadline,
        payment_deadline: selectedSeason.payment_deadline,
        is_active: selectedSeason.is_active,
      })
    }
  }, [selectedSeason])

  useEffect(() => {
    loadSeasons()
  }, [])

  useEffect(() => {
    if (selectedSeasonId) {
      loadRegistrations(selectedSeasonId)
    } else if (!isLoadingSeasons) {
      // No seasons -> clear lists
      setRegistrations([])
      setFilteredRegistrations([])
      setStatistics(null)
    }
  }, [selectedSeasonId, isLoadingSeasons])

  useEffect(() => {
    if (registrations.length > 0) {
      calculateStatistics()
    }
  }, [registrations])

  useEffect(() => {
    filterRegistrations()
  }, [searchQuery, registrations])

  useEffect(() => {
    // Beim Ausklappen der Statistiken automatisch aktualisieren, wenn keine Statistiken vorhanden sind
    if (isStatisticsExpanded && !statistics && selectedSeasonId) {
      loadRegistrations(selectedSeasonId)
    }
  }, [isStatisticsExpanded])


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
    const athletesByCategory = {
      u10_m: 0,
      u10_w: 0,
      u12_m: 0,
      u12_w: 0,
      u14_m: 0,
      u14_w: 0,
    }
    const athletesByYear: Record<number, number> = {}
    const currentYear = new Date().getFullYear()

    registrations.forEach(reg => {
      if (reg.club) {
        clubs.set(reg.club, (clubs.get(reg.club) || 0) + 1)
      }
      reg.athletes.forEach(athlete => {
        if (athlete.gender === 'm') athletesByGender.m++
        if (athlete.gender === 'w') athletesByGender.w++
        athletesByYear[athlete.birth_year] = (athletesByYear[athlete.birth_year] || 0) + 1

        // Kategorien nach Jahrgang
        // U10: Jahr >= currentYear - 9 (jüngere bleiben U10)
        // U12: Jahr == currentYear - 11 oder -10
        // U14: Jahr == currentYear - 13 oder -12
        if (athlete.birth_year >= currentYear - 9) {
          if (athlete.gender === 'm') athletesByCategory.u10_m++
          if (athlete.gender === 'w') athletesByCategory.u10_w++
        } else if (
          athlete.birth_year === currentYear - 10 ||
          athlete.birth_year === currentYear - 11
        ) {
          if (athlete.gender === 'm') athletesByCategory.u12_m++
          if (athlete.gender === 'w') athletesByCategory.u12_w++
        } else if (
          athlete.birth_year === currentYear - 12 ||
          athlete.birth_year === currentYear - 13
        ) {
          if (athlete.gender === 'm') athletesByCategory.u14_m++
          if (athlete.gender === 'w') athletesByCategory.u14_w++
        }
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
      athletesByCategory,
      athletesByYear,
      clubs: clubsArray,
    })
  }

  async function loadSeasons() {
    try {
      setIsLoadingSeasons(true)
      const { data, error: fetchError } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
        .order('event_number', { ascending: false })

      if (fetchError) {
        throw new Error(`Fehler beim Laden der Saisons: ${fetchError.message}`)
      }

      const seasonsData = data || []
      setSeasons(seasonsData)

      // Wähle aktive Saison oder fallback auf erste
      const activeSeason = seasonsData.find((s) => s.is_active)
      const fallbackSeason = seasonsData[0]
      setSelectedSeasonId((prev) => prev ?? activeSeason?.id ?? fallbackSeason?.id ?? null)

      // Wenn noch keine Saison existiert, Ladezustand für Anmeldungen beenden
      if (seasonsData.length === 0) {
        setIsLoading(false)
        setFilteredRegistrations([])
        setRegistrations([])
        setStatistics(null)
      }
    } catch (err) {
      console.error('Error loading seasons:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Saisons')
    } finally {
      setIsLoadingSeasons(false)
    }
  }

  async function loadRegistrations(seasonId?: string | null) {
    const candidate = seasonId ?? selectedSeasonId
    const activeSeasonId =
      typeof candidate === 'string'
        ? candidate
        : typeof candidate === 'object' && candidate !== null
          ? // falls versehentlich ein Objekt statt einer ID durchgereicht wurde
            (candidate as any).id ?? null
          : null

    if (!activeSeasonId || typeof activeSeasonId !== 'string') {
      setRegistrations([])
      setFilteredRegistrations([])
      setStatistics(null)
      setError('Ungültige Saison-ID. Bitte Saison neu wählen oder neu laden.')
      return
    }
    if (!activeSeasonId) {
      setRegistrations([])
      setFilteredRegistrations([])
      setStatistics(null)
      return
    }

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
          season_id,
          athletes (
            id,
            first_name,
            last_name,
            birth_year,
            gender
          )
        `)
        .eq('season_id', activeSeasonId)
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
        season_id: reg.season_id,
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

  function exportAthletesCsv() {
    if (!registrations.length) {
      setError('Keine Anmeldungen für diese Saison vorhanden.')
      return
    }

    const header = ['Name', 'Vorname', 'Jahrgang', 'Verein', 'Geschlecht']

    const escapeCsv = (value: string | number | null | undefined) => {
      const str = (value ?? '').toString()
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = registrations.flatMap(reg =>
      reg.athletes.map(athlete => [
        athlete.last_name,
        athlete.first_name,
        athlete.birth_year,
        reg.club || '',
        athlete.gender?.toUpperCase() === 'M' ? 'M' : 'W',
      ])
    )

    const csv = [header, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const seasonLabel = selectedSeason?.year ? `_${selectedSeason.year}` : ''
    link.download = `anmeldungen${seasonLabel}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleSeasonFieldChange<T extends keyof typeof seasonForm>(field: T, value: (typeof seasonForm)[T]) {
    setSeasonForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleEditSeasonFieldChange<T extends keyof typeof editSeasonForm>(field: T, value: (typeof editSeasonForm)[T]) {
    setEditSeasonForm((prev) => ({ ...prev, [field]: value }))
  }

  function openCreateSeasonForm() {
    const lastSeason = seasons[0]
    const addYear = (dateString?: string) => {
      if (!dateString) return ''
      const d = new Date(dateString)
      if (Number.isNaN(d.getTime())) return ''
      d.setFullYear(d.getFullYear() + 1)
      return d.toISOString().slice(0, 10)
    }

    setSeasonForm({
      year: (lastSeason?.year ?? new Date().getFullYear()) + 1,
      event_date: addYear(lastSeason?.event_date),
      event_number: (lastSeason?.event_number ?? 0) + 1,
      signup_deadline: addYear(lastSeason?.signup_deadline),
      payment_deadline: addYear(lastSeason?.payment_deadline),
      is_active: true,
    })
    setShowCreateSeason(true)
  }

  async function handleCreateSeason(event?: React.FormEvent) {
    if (event) event.preventDefault()

    if (!seasonForm.year || !seasonForm.event_date || !seasonForm.signup_deadline || !seasonForm.payment_deadline) {
      setError('Bitte Jahr, Wettkampfdatum, Anmeldefrist und Zahlungsfrist ausfüllen.')
      return
    }

    try {
      setError(null)
      const { data, error } = await supabase
        .from('seasons')
        .insert({
          year: seasonForm.year,
          event_date: seasonForm.event_date,
          event_number: seasonForm.event_number,
          signup_deadline: seasonForm.signup_deadline,
          payment_deadline: seasonForm.payment_deadline,
          is_active: seasonForm.is_active,
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      if (!data) {
        throw new Error('Season konnte nicht erstellt werden.')
      }

      // Liste aktualisieren und neue Season auswählen
      await loadSeasons()
      setSelectedSeasonId(data.id)
      setSuccessMessage('Saison wurde erstellt.')
      setTimeout(() => setSuccessMessage(null), 3000)

      // Formular zurücksetzen
      setSeasonForm({
        year: new Date().getFullYear(),
        event_date: '',
        event_number: 1,
        signup_deadline: '',
        payment_deadline: '',
        is_active: false,
      })
    } catch (err) {
      console.error('Error creating season:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Saison')
    }
  }

  async function handleUpdateSeason(event?: React.FormEvent) {
    if (event) event.preventDefault()
    if (!selectedSeasonId) {
      setError('Bitte zuerst eine Saison auswählen.')
      return
    }

    if (!editSeasonForm.year || !editSeasonForm.event_date || !editSeasonForm.signup_deadline || !editSeasonForm.payment_deadline) {
      setError('Bitte Jahr, Wettkampfdatum, Anmeldefrist und Zahlungsfrist ausfüllen.')
      return
    }

    try {
      setError(null)
      const { error } = await supabase
        .from('seasons')
        .update({
          year: editSeasonForm.year,
          event_date: editSeasonForm.event_date,
          event_number: editSeasonForm.event_number,
          signup_deadline: editSeasonForm.signup_deadline,
          payment_deadline: editSeasonForm.payment_deadline,
          is_active: editSeasonForm.is_active,
        })
        .eq('id', selectedSeasonId)

      if (error) throw error

      await loadSeasons()
      setSelectedSeasonId(selectedSeasonId)
      setSuccessMessage('Saison aktualisiert.')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Error updating season:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Aktualisieren der Saison')
    }
  }

  async function handleDeleteSeason(seasonId: string) {
    const confirmed = confirm('Möchten Sie diese Saison wirklich löschen? Zugeordnete Anmeldungen bleiben bestehen, verweisen aber auf eine gelöschte Saison.')
    if (!confirmed) return

    try {
      setError(null)
      const { error } = await supabase.from('seasons').delete().eq('id', seasonId)
      if (error) throw error

      if (selectedSeasonId === seasonId) {
        setSelectedSeasonId(null)
      }
      await loadSeasons()
      setSuccessMessage('Saison gelöscht.')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      console.error('Error deleting season:', err)
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen der Saison')
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
          season_id: selectedSeasonId ?? registration.season_id ?? null,
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
          season_id: deletedRegistration.season_id,
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
    if (selectedSeason) {
      return `${baseUrl}/${selectedSeason.year}/edit/${token}`
    }
    return `${baseUrl}/edit/${token}`
  }

  if (isLoadingSeasons || isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Lade Saisons und Anmeldungen...</p>
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
          {/* Seasons management */}
          <div className="admin-section">
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                cursor: 'pointer',
                userSelect: 'none'
              }}
              onClick={() => setIsSeasonSelectExpanded(!isSeasonSelectExpanded)}
            >
              <h2 className="admin-section-title" style={{ margin: 0 }}>Saison wählen</h2>
              <span style={{ 
                fontSize: '1.25rem', 
                transition: 'transform 0.2s',
                transform: isSeasonSelectExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
              }}>
                ▼
              </span>
            </div>
            {isSeasonSelectExpanded && (
            <div>
            {seasons.length === 0 ? (
              <p style={{ marginTop: '0.5rem' }}>Noch keine Saison vorhanden. Bitte neue Saison anlegen.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                {seasons.map((season) => {
                  const isSelected = season.id === selectedSeasonId
                  const isActive = season.is_active
                  return (
                    <button
                      key={season.id}
                      onClick={() => setSelectedSeasonId(season.id)}
                      className="admin-season-card"
                      style={{
                        textAlign: 'left',
                        padding: '0.9rem 1rem',
                        borderRadius: 12,
                        border: isSelected ? '2px solid #4C1D95' : '1px solid #e2e8f0',
                        background: isSelected ? '#f5f3ff' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <strong style={{ color: '#0f172a', fontSize: '1rem' }}>{season.year}</strong>
                        <span
                          style={{
                            fontSize: '0.8rem',
                            padding: '0.15rem 0.45rem',
                            borderRadius: 999,
                            background: isActive ? '#dcfce7' : '#f1f5f9',
                            color: isActive ? '#166534' : '#475569',
                            border: isActive ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                          }}
                        >
                          {isActive ? 'aktiv' : 'inaktiv'}
                        </span>
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.9rem' }}>
                        Event #{season.event_number} · {new Date(season.event_date).toLocaleDateString('de-CH')}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.85rem' }}>
                        Anmeldefrist: {new Date(season.signup_deadline).toLocaleDateString('de-CH')}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.85rem' }}>
                        Zahlungsfrist: {new Date(season.payment_deadline).toLocaleDateString('de-CH')}
                      </div>
                      <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteSeason(season.id)
                          }}
                          style={{
                            color: '#dc2626',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                          }}
                        >
                          Löschen
                        </span>
                      </div>
                    </button>
                  )
                })}
                <button
                  onClick={() => {
                    if (showCreateSeason) {
                      setShowCreateSeason(false)
                    } else {
                      openCreateSeasonForm()
                    }
                  }}
                  style={{
                    textAlign: 'center',
                    padding: '1rem',
                    borderRadius: 12,
                    border: '1px dashed #cbd5e1',
                    background: '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    color: '#0f172a',
                    fontWeight: 600,
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>+</span> Neue Saison
                </button>
              </div>
            )}
            </div>
            )}
          </div>

          {showCreateSeason && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem',
              }}
              onClick={() => setShowCreateSeason(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 'min(900px, 100%)',
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '1.5rem',
                  boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
                  <h2 className="admin-section-title" style={{ margin: 0 }}>Neue Saison anlegen</h2>
                  <button
                    onClick={() => setShowCreateSeason(false)}
                    style={{
                      padding: '0.45rem 0.9rem',
                      backgroundColor: '#e2e8f0',
                      border: 'none',
                      borderRadius: 10,
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: '#0f172a',
                    }}
                  >
                    Schließen
                  </button>
                </div>
                <form onSubmit={handleCreateSeason} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label className="admin-label">Jahr</label>
                    <input
                      type="number"
                      value={seasonForm.year}
                      onChange={(e) => handleSeasonFieldChange('year', parseInt(e.target.value, 10) || new Date().getFullYear())}
                      className="admin-input"
                      min={2020}
                      max={2100}
                    />
                  </div>
                  <div>
                    <label className="admin-label">Wettkampfdatum</label>
                    <input
                      type="date"
                      value={seasonForm.event_date}
                      onChange={(e) => handleSeasonFieldChange('event_date', e.target.value)}
                      className="admin-input"
                    />
                  </div>
                  <div>
                    <label className="admin-label">Event-Nummer</label>
                    <input
                      type="number"
                      value={seasonForm.event_number}
                      onChange={(e) => handleSeasonFieldChange('event_number', parseInt(e.target.value, 10) || 1)}
                      className="admin-input"
                      min={1}
                      max={50}
                    />
                  </div>
                  <div>
                    <label className="admin-label">Anmeldefrist</label>
                    <input
                      type="date"
                      value={seasonForm.signup_deadline}
                      onChange={(e) => handleSeasonFieldChange('signup_deadline', e.target.value)}
                      className="admin-input"
                    />
                  </div>
                  <div>
                    <label className="admin-label">Zahlungsfrist</label>
                    <input
                      type="date"
                      value={seasonForm.payment_deadline}
                      onChange={(e) => handleSeasonFieldChange('payment_deadline', e.target.value)}
                      className="admin-input"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.7rem' }}>
                    <input
                      type="checkbox"
                      id="season-is-active"
                      checked={seasonForm.is_active}
                      onChange={(e) => handleSeasonFieldChange('is_active', e.target.checked)}
                      className="admin-checkbox"
                    />
                    <label htmlFor="season-is-active" className="admin-label" style={{ margin: 0 }}>
                      Als aktiv setzen
                    </label>
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowCreateSeason(false)}
                      style={{
                        padding: '0.75rem 1.1rem',
                        backgroundColor: '#e2e8f0',
                        color: '#0f172a',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      style={{
                        padding: '0.75rem 1.25rem',
                        backgroundColor: '#4C1D95',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Saison erstellen
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="admin-section">
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                gap: '1rem',
                cursor: 'pointer',
                userSelect: 'none'
              }}
              onClick={() => setIsSeasonEditExpanded(!isSeasonEditExpanded)}
            >
              <h2 className="admin-section-title" style={{ margin: 0 }}>Saison bearbeiten</h2>
              <span style={{ 
                fontSize: '1.25rem', 
                transition: 'transform 0.2s',
                transform: isSeasonEditExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
              }}>
                ▼
              </span>
            </div>
            {isSeasonEditExpanded && (
            <div>
            {selectedSeason ? (
              <form onSubmit={handleUpdateSeason} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <label className="admin-label">Jahr</label>
                  <input
                    type="number"
                    value={editSeasonForm.year}
                    onChange={(e) => handleEditSeasonFieldChange('year', parseInt(e.target.value, 10) || new Date().getFullYear())}
                    className="admin-input"
                    min={2020}
                    max={2100}
                  />
                </div>
                <div>
                  <label className="admin-label">Wettkampfdatum</label>
                  <input
                    type="date"
                    value={editSeasonForm.event_date}
                    onChange={(e) => handleEditSeasonFieldChange('event_date', e.target.value)}
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label">Event-Nummer</label>
                  <input
                    type="number"
                    value={editSeasonForm.event_number}
                    onChange={(e) => handleEditSeasonFieldChange('event_number', parseInt(e.target.value, 10) || 1)}
                    className="admin-input"
                    min={1}
                    max={50}
                  />
                </div>
                <div>
                  <label className="admin-label">Anmeldefrist</label>
                  <input
                    type="date"
                    value={editSeasonForm.signup_deadline}
                    onChange={(e) => handleEditSeasonFieldChange('signup_deadline', e.target.value)}
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label">Zahlungsfrist</label>
                  <input
                    type="date"
                    value={editSeasonForm.payment_deadline}
                    onChange={(e) => handleEditSeasonFieldChange('payment_deadline', e.target.value)}
                    className="admin-input"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.7rem' }}>
                  <input
                    type="checkbox"
                    id="edit-season-is-active"
                    checked={editSeasonForm.is_active}
                    onChange={(e) => handleEditSeasonFieldChange('is_active', e.target.checked)}
                    className="admin-checkbox"
                  />
                  <label htmlFor="edit-season-is-active" className="admin-label" style={{ margin: 0 }}>
                    Saison aktiv
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="submit"
                    style={{
                      padding: '0.75rem 1.25rem',
                      backgroundColor: '#4C1D95',
                      color: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      width: '100%',
                    }}
                  >
                    Saison speichern
                  </button>
                </div>
              </form>
            ) : (
              <p style={{ marginTop: '0.5rem' }}>Keine Saison ausgewählt.</p>
            )}
            </div>
            )}
          </div>
          {/* Statistics Section - First */}
          <div className="admin-section">
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                cursor: 'pointer',
                userSelect: 'none'
              }}
              onClick={() => setIsStatisticsExpanded(!isStatisticsExpanded)}
            >
              <h2 className="admin-section-title" style={{ margin: 0 }}>Statistiken</h2>
              <span style={{ 
                fontSize: '1.25rem', 
                transition: 'transform 0.2s',
                transform: isStatisticsExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
              }}>
                ▼
              </span>
            </div>
            {isStatisticsExpanded && statistics && (
            <div>
            <div className="admin-stats-grid">
              <div className="admin-stat-card admin-stat-card-rose">
                <div className="admin-stat-value admin-stat-value-rose">
                  {statistics.athletesByCategory.u10_w}
                </div>
                <div className="admin-stat-label admin-stat-label-rose">U10 Weiblich</div>
              </div>
              <div className="admin-stat-card admin-stat-card-sky">
                <div className="admin-stat-value admin-stat-value-sky">
                  {statistics.athletesByCategory.u10_m}
                </div>
                <div className="admin-stat-label admin-stat-label-sky">U10 Männlich</div>
              </div>
              <div className="admin-stat-card admin-stat-card-amber">
                <div className="admin-stat-value admin-stat-value-amber">
                  {statistics.athletesByCategory.u12_w}
                </div>
                <div className="admin-stat-label admin-stat-label-amber">U12 Weiblich</div>
              </div>
              <div className="admin-stat-card admin-stat-card-emerald">
                <div className="admin-stat-value admin-stat-value-emerald">
                  {statistics.athletesByCategory.u12_m}
                </div>
                <div className="admin-stat-label admin-stat-label-emerald">U12 Männlich</div>
              </div>
              <div className="admin-stat-card admin-stat-card-violet">
                <div className="admin-stat-value admin-stat-value-violet">
                  {statistics.athletesByCategory.u14_w}
                </div>
                <div className="admin-stat-label admin-stat-label-violet">U14 Weiblich</div>
              </div>
              <div className="admin-stat-card admin-stat-card-slate">
                <div className="admin-stat-value admin-stat-value-slate">
                  {statistics.athletesByCategory.u14_m}
                </div>
                <div className="admin-stat-label admin-stat-label-slate">U14 Männlich</div>
              </div>
            </div>

            {/* Clubs List */}
            {statistics.clubs.length > 0 && (
              <div className="admin-clubs-list">
                <h3 className="admin-clubs-title">Vereine</h3>
                <div className="admin-clubs-grid">
                  {statistics.clubs.map((club, index) => (
                    <div key={index} className="admin-club-badge">
                      <span className="admin-club-name">
                        {club.name} ({club.count})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </div>
            )}
            {isStatisticsExpanded && !statistics && (
              <p style={{ marginTop: '0.5rem' }}>Keine Statistiken verfügbar.</p>
            )}
          </div>

          {/* Divider */}
          {statistics && <div className="admin-divider" />}

          {/* Registrations List with integrated search */}
          {/* Header with search integrated */}
          <div className="admin-section" style={{ marginBottom: '2rem' }}>
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '1.5rem', 
                flexWrap: 'wrap', 
                gap: '1rem',
                cursor: 'pointer',
                userSelect: 'none'
              }}
              onClick={() => setIsRegistrationsExpanded(!isRegistrationsExpanded)}
            >
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem', fontWeight: 700 }}>
                Anmeldungen {searchQuery ? `(${filteredRegistrations.length} von ${registrations.length})` : `(${registrations.length})`}
              </h2>
              <span style={{ 
                fontSize: '1.25rem', 
                transition: 'transform 0.2s',
                transform: isRegistrationsExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
              }}>
                ▼
              </span>
            </div>
            {isRegistrationsExpanded && (
            <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => loadRegistrations().then(() => calculateStatistics())}
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
                <button
                  onClick={exportAthletesCsv}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#0ea5e9',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0284c7'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#0ea5e9'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  Anmeldungen als CSV exportieren
                </button>
              </div>
            </div>
            
            {/* Search bar integrated */}
            <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
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
                    <div 
                      className="admin-athletes-header"
                      style={{ 
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                      onClick={() => {
                        const newExpanded = new Set(expandedAthletes)
                        if (newExpanded.has(reg.id)) {
                          newExpanded.delete(reg.id)
                        } else {
                          newExpanded.add(reg.id)
                        }
                        setExpandedAthletes(newExpanded)
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ 
                          fontSize: '1rem', 
                          transition: 'transform 0.2s',
                          transform: expandedAthletes.has(reg.id) ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}>
                          ▼
                        </span>
                        <strong className="admin-athletes-title">
                          Athleten ({reg.athletes.length})
                        </strong>
                      </div>
                      {isEditingRegistration && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAddAthlete(reg.id)
                          }}
                          className="admin-button admin-button-secondary admin-add-athlete-button"
                        >
                          + Athlet hinzufügen
                        </button>
                      )}
                    </div>
                    {reg.athletes.length === 0 ? (
                      <p className="admin-empty-athletes">Keine Athleten</p>
                    ) : expandedAthletes.has(reg.id) && (
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
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default AdminDashboard
