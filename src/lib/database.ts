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

/**
 * Makes the registration ID URL-safe by encoding it as base64url
 * This ensures the UUID is safe to use in URLs while maintaining security
 */
function makeSecureEditToken(registrationId: string): string {
  // Convert UUID to base64url for URL safety
  // Remove dashes and convert to base64url
  const uuidWithoutDashes = registrationId.replace(/-/g, '')
  const base64 = btoa(uuidWithoutDashes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  return base64
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
  }>
}

/**
 * Loads a registration by edit token
 */
export async function loadRegistrationByToken(editToken: string): Promise<RegistrationWithAthletes | null> {
  const { data: registration, error } = await supabase
    .from('registrations')
    .select('*')
    .eq('edit_token', editToken)
    .single()

  if (error || !registration) {
    return null
  }

  // Load athletes
  const { data: athletes, error: athletesError } = await supabase
    .from('athletes')
    .select('*')
    .eq('registration_id', registration.id)
    .order('created_at', { ascending: true })

  if (athletesError) {
    throw new Error(`Failed to load athletes: ${athletesError.message}`)
  }

  return {
    id: registration.id,
    guardian_name: registration.guardian_name,
    club: registration.club,
    email: registration.email,
    phone: registration.phone,
    created_at: registration.created_at,
    season_id: registration.season_id,
    athletes: athletes || [],
  }
}

/**
 * Updates an existing registration
 */
export async function updateRegistration(
  registrationId: string,
  data: RegistrationData
): Promise<RegistrationResult> {
  // Prevent edits after signup deadline
  const { data: registration, error: registrationLookupError } = await supabase
    .from('registrations')
    .select('season_id, edit_token')
    .eq('id', registrationId)
    .maybeSingle()

  if (registrationLookupError || !registration) {
    throw new Error('Anmeldung nicht gefunden.')
  }

  if (registration.season_id) {
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('signup_deadline')
      .eq('id', registration.season_id)
      .maybeSingle()

    if (seasonError) {
      throw new Error(`Anmeldeschluss konnte nicht geprüft werden: ${seasonError.message}`)
    }

    if (season?.signup_deadline) {
      const signupDeadline = new Date(season.signup_deadline)
      // Allow edits until end of the signup day
      signupDeadline.setHours(23, 59, 59, 999)

      if (new Date() > signupDeadline) {
        throw new Error('Änderungen sind nach dem Anmeldeschluss nicht mehr möglich.')
      }
    }
  }

  // Update the registration
  const { error: updateError } = await supabase
    .from('registrations')
    .update({
      guardian_name: data.guardian_name,
      club: data.club || null,
      email: data.email,
      phone: data.phone,
      ...(data.season_id ? { season_id: data.season_id } : {}),
    })
    .eq('id', registrationId)

  if (updateError) {
    throw new Error(`Failed to update registration: ${updateError.message}`)
  }

  // Delete existing athletes
  const { error: deleteError } = await supabase
    .from('athletes')
    .delete()
    .eq('registration_id', registrationId)

  if (deleteError) {
    throw new Error(`Failed to delete existing athletes: ${deleteError.message}`)
  }

  // Insert new athletes
  const athletesToInsert = data.athletes.map(athlete => ({
    registration_id: registrationId,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    birth_year: athlete.birth_year,
    gender: athlete.gender,
  }))

  const { error: athletesError } = await supabase
    .from('athletes')
    .insert(athletesToInsert)

  if (athletesError) {
    throw new Error(`Failed to save athletes: ${athletesError.message}`)
  }

  // After successful update, attempt to send the edit-link email.
  // If sending fails, we do NOT rollback — caller will be informed via the
  // `email_sent` flag so the UI can prompt the user to correct the address.
  let emailSent = true
  try {
    await sendEditLinkEmail(data.email, registration.edit_token || '', registrationId)
  } catch (err) {
    console.error('Failed to send edit-link email after update:', err)
    emailSent = false
  }

  return {
    id: registrationId,
    edit_token: registration.edit_token || '',
    email_sent: emailSent,
  }
}

export async function saveRegistration(data: RegistrationData): Promise<RegistrationResult> {
  if (!data.season_id) {
    throw new Error('Season ist erforderlich, um eine Anmeldung zu speichern.')
  }

  // First, insert the registration (ID will be auto-generated by database)
  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .insert({
      guardian_name: data.guardian_name,
      club: data.club || null,
      email: data.email,
      phone: data.phone,
      season_id: data.season_id,
    })
    .select()
    .single()

  if (registrationError) {
    throw new Error(`Failed to save registration: ${registrationError.message}`)
  }

  if (!registration) {
    throw new Error('Failed to save registration: No data returned')
  }

  // Use the registration ID as edit token, but make it URL-safe
  const editToken = makeSecureEditToken(registration.id)
  
  // Update the registration with the secure edit token
  const { error: updateError } = await supabase
    .from('registrations')
    .update({ edit_token: editToken })
    .eq('id', registration.id)

  if (updateError) {
    // Rollback: delete the registration if we can't set the token
    await supabase.from('registrations').delete().eq('id', registration.id)
    throw new Error(`Failed to set edit token: ${updateError.message}`)
  }

  // Then, insert all athletes with the registration_id
  const athletesToInsert = data.athletes.map(athlete => ({
    registration_id: registration.id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    birth_year: athlete.birth_year,
    gender: athlete.gender,
  }))

  const { error: athletesError } = await supabase
    .from('athletes')
    .insert(athletesToInsert)

  if (athletesError) {
    // Rollback: delete the registration if we can't save athletes
    await supabase.from('registrations').delete().eq('id', registration.id)
    throw new Error(`Failed to save athletes: ${athletesError.message}`)
  }

  // Try to send email with edit link - if this fails, registration is still saved
  // but we throw the error so the UI can handle it (e.g., allow user to correct email)
  try {
    await sendEditLinkEmail(data.email, editToken, registration.id)
  } catch (error) {
    console.error('Failed to send email, but registration was saved:', error)
    // Re-throw email errors so the UI can handle them
    // Registration was successful, but user should be able to correct email
    if (error instanceof Error && (error as any).isEmailError) {
      throw error
    }
    // For other errors, still throw but mark as email error
    const emailError = new Error(`E-Mail konnte nicht versendet werden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`)
    ;(emailError as any).isEmailError = true
    ;(emailError as any).emailAddress = data.email
    throw emailError
  }

  return {
    id: registration.id,
    edit_token: editToken,
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

export function mapAthleteToChild(athlete: { first_name: string; last_name: string; birth_year: number; gender: 'm' | 'w' }): Child {
  return {
    id: crypto.randomUUID(),
    vorname: athlete.first_name,
    nachname: athlete.last_name,
    jahrgang: athlete.birth_year.toString(),
    geschlecht: athlete.gender.toUpperCase() as 'M' | 'W',
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

