import { supabase } from './supabase'
import type { Child } from '../types/child'
import { sendEditLinkEmail } from './email'

export type RegistrationData = {
  guardian_name: string
  club: string | null
  email: string
  phone: string
  athletes: AthleteData[]
  season_id?: string
  newsletter_opt_in?: boolean
}

export type Season = {
  id: string
  year: number
  event_date: string
  event_number: number
  signup_deadline: string
  payment_deadline: string
  is_active: boolean
  created_at: string
}

export type AthleteData = {
  first_name: string
  last_name: string
  birth_year: number
  gender: 'm' | 'w'
}

export type RegistrationResult = {
  id: string
  edit_token: string
  email_sent?: boolean
}

export type RegistrationWithAthletes = {
  id: string
  guardian_name: string
  club: string | null
  email: string
  phone: string
  created_at: string
  season_id: string | null
  athletes: Array<{
    id: string
    first_name: string
    last_name: string
    birth_year: number
    gender: 'm' | 'w'
    withdrawn_at: string | null
  }>
}

type RegistrationRpcResult = {
  id: string
  edit_token: string
  season_id: string | null
}

// Öffentliche Zugriffe laufen über RPC-Funktionen in der Datenbank, weil die Tabellen
// per Row Level Security nur für Admins direkt zugänglich sind.
function toRpcParams(data: RegistrationData) {
  return {
    p_guardian_name: data.guardian_name,
    p_club: data.club || null,
    p_email: data.email,
    p_phone: data.phone,
    p_athletes: data.athletes,
    p_newsletter_opt_in: data.newsletter_opt_in ?? null,
  }
}

/**
 * Loads a registration by edit token
 */
export async function loadRegistrationByToken(editToken: string): Promise<RegistrationWithAthletes | null> {
  const { data, error } = await supabase.rpc('get_registration_by_token', { p_edit_token: editToken })

  if (error) {
    throw new Error(`Failed to load registration: ${error.message}`)
  }

  return (data as RegistrationWithAthletes | null) ?? null
}

/**
 * Updates an existing registration, identified by its edit token
 */
export async function updateRegistration(
  editToken: string,
  data: RegistrationData,
  { resendEmail = false }: { resendEmail?: boolean } = {}
): Promise<RegistrationResult> {
  // Deadline is enforced in the database function
  const { data: result, error } = await supabase.rpc('update_registration_by_token', {
    p_edit_token: editToken,
    ...toRpcParams(data),
  })

  if (error || !result) {
    throw new Error(error?.message || 'Anmeldung konnte nicht aktualisiert werden.')
  }

  const registration = result as RegistrationRpcResult

  // Updates are silent. The e-mail is only sent again when the first one failed, otherwise
  // the trainer would never receive the edit link. If it fails again, we do NOT rollback —
  // caller will be informed via the `email_sent` flag so the UI can prompt for a correction.
  let emailSent: boolean | undefined
  if (resendEmail) {
    try {
      await sendEditLinkEmail(data.email, registration.edit_token)
      emailSent = true
    } catch (err) {
      console.error('Failed to send edit-link email after update:', err)
      emailSent = false
    }
  }

  return {
    id: registration.id,
    edit_token: registration.edit_token,
    email_sent: emailSent,
  }
}

/**
 * Withdraws an athlete or reverts the withdrawal. Returns the stored withdrawal timestamp.
 */
export async function setAthleteWithdrawn(
  editToken: string,
  athleteId: string,
  withdrawn: boolean
): Promise<string | null> {
  // Withdrawal window is enforced in the database function
  const { data, error } = await supabase.rpc('set_athlete_withdrawn', {
    p_edit_token: editToken,
    p_athlete_id: athleteId,
    p_withdrawn: withdrawn,
  })

  if (error) {
    throw new Error(error.message || 'Abmeldung konnte nicht gespeichert werden.')
  }

  return (data as string | null) ?? null
}

export async function saveRegistration(data: RegistrationData): Promise<RegistrationResult> {
  if (!data.season_id) {
    throw new Error('Season ist erforderlich, um eine Anmeldung zu speichern.')
  }

  // Registration, athletes and edit token are created atomically; the deadline is checked in the database
  const { data: result, error } = await supabase.rpc('create_registration', {
    p_season_id: data.season_id,
    ...toRpcParams(data),
  })

  if (error || !result) {
    throw new Error(error?.message || 'Anmeldung konnte nicht gespeichert werden.')
  }

  const registration = result as RegistrationRpcResult

  // Try to send email with edit link - if this fails, registration is still saved
  // but we throw the error so the UI can handle it (e.g., allow user to correct email)
  try {
    await sendEditLinkEmail(data.email, registration.edit_token)
  } catch (error) {
    console.error('Failed to send email, but registration was saved:', error)
    // Re-throw email errors so the UI can handle them
    // Registration was successful, but user should be able to correct email
    if (error instanceof Error && (error as any).isEmailError) {
      throw Object.assign(error, { registration })
    }
    // For other errors, still throw but mark as email error
    const emailError = new Error(`E-Mail konnte nicht versendet werden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`)
    ;(emailError as any).isEmailError = true
    ;(emailError as any).emailAddress = data.email
    throw Object.assign(emailError, { registration })
  }

  return {
    id: registration.id,
    edit_token: registration.edit_token,
  }
}

export async function loadActiveSeason(): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load active season: ${error.message}`)
  }

  return data ?? null
}

export async function loadSeasonByYear(year: number): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', year)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load season for year ${year}: ${error.message}`)
  }

  return data ?? null
}

export async function loadSeasonById(id: string): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load season ${id}: ${error.message}`)
  }

  return data ?? null
}

export async function listSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('year', { ascending: false })
    .order('event_number', { ascending: false })

  if (error) {
    throw new Error(`Failed to list seasons: ${error.message}`)
  }

  return data || []
}

export async function createSeason(season: Omit<Season, 'id' | 'created_at' | 'is_active'> & { is_active?: boolean }): Promise<Season> {
  const { data, error } = await supabase
    .from('seasons')
    .insert({
      year: season.year,
      event_date: season.event_date,
      event_number: season.event_number,
      signup_deadline: season.signup_deadline,
      payment_deadline: season.payment_deadline,
      is_active: season.is_active ?? false,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create season: ${error.message}`)
  }

  if (!data) {
    throw new Error('Season creation returned no data')
  }

  return data as Season
}

export function mapAthleteToChild(athlete: { id: string; first_name: string; last_name: string; birth_year: number; gender: 'm' | 'w'; withdrawn_at: string | null }): Child {
  return {
    id: crypto.randomUUID(),
    vorname: athlete.first_name,
    nachname: athlete.last_name,
    jahrgang: athlete.birth_year.toString(),
    geschlecht: athlete.gender.toUpperCase() as 'M' | 'W',
    athleteId: athlete.id,
    withdrawnAt: athlete.withdrawn_at,
  }
}

export function mapChildToAthlete(child: Child): AthleteData {
  return {
    first_name: child.vorname.trim(),
    last_name: child.nachname.trim(),
    birth_year: parseInt(child.jahrgang, 10) || 0,
    gender: child.geschlecht.toLowerCase() as 'm' | 'w',
  }
}
