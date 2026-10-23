import { supabase } from './supabase'

export type HelperAvailability = 'ganzer_tag' | 'vormittag' | 'nachmittag'
export type HelperInterest = 'wirtschaft' | 'anlagen'

export type HelperForm = {
  season_id: string
  is_open: boolean
  morning_label: string
  afternoon_label: string
  note: string
  contact_email: string | null
  created_at: string
}

export type HelperSignupData = {
  availability: HelperAvailability
  interests: HelperInterest[]
  first_name: string
  last_name: string
  mobile: string
  email: string
}

export type HelperSignup = HelperSignupData & {
  id: string
  season_id: string
  created_at: string
}

export const INTEREST_LABELS: Record<HelperInterest, string> = {
  wirtschaft: 'Wirtschaft',
  anlagen: 'Wettkampf-Anlagen',
}

export const availabilityLabel = (availability: HelperAvailability, form?: HelperForm | null) => {
  if (availability === 'vormittag') return form?.morning_label ?? 'Vormittag'
  if (availability === 'nachmittag') return form?.afternoon_label ?? 'Nachmittag'
  return 'Ganzer Tag'
}

export const helperSignupLink = (seasonYear: number) => `${window.location.origin}/${seasonYear}/helfer`

export async function loadHelperForm(seasonId: string): Promise<HelperForm | null> {
  const { data, error } = await supabase.from('helper_forms').select('*').eq('season_id', seasonId).maybeSingle()
  if (error) throw new Error(`Helferformular konnte nicht geladen werden: ${error.message}`)
  return data
}

export async function createHelperForm(seasonId: string): Promise<HelperForm> {
  const { data, error } = await supabase.from('helper_forms').insert({ season_id: seasonId }).select().single()
  if (error) throw new Error(`Helferformular konnte nicht erstellt werden: ${error.message}`)
  return data
}

export async function updateHelperForm(
  seasonId: string,
  changes: Partial<Pick<HelperForm, 'is_open' | 'morning_label' | 'afternoon_label' | 'note' | 'contact_email'>>
): Promise<HelperForm> {
  const { data, error } = await supabase.from('helper_forms').update(changes).eq('season_id', seasonId).select().single()
  if (error) throw new Error(`Helferformular konnte nicht gespeichert werden: ${error.message}`)
  return data
}

export async function loadHelperSignups(seasonId: string): Promise<HelperSignup[]> {
  const { data, error } = await supabase
    .from('helper_signups')
    .select('*')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Helferanmeldungen konnten nicht geladen werden: ${error.message}`)
  return data ?? []
}

export async function deleteHelperSignup(id: string): Promise<void> {
  const { error } = await supabase.from('helper_signups').delete().eq('id', id)
  if (error) throw new Error(`Helferanmeldung konnte nicht gelöscht werden: ${error.message}`)
}

/**
 * Saves a public helper signup and sends the confirmation e-mail.
 * Returns whether the e-mail could be sent; the signup is saved either way.
 */
export async function saveHelperSignup(seasonId: string, data: HelperSignupData): Promise<{ emailSent: boolean }> {
  const { data: id, error } = await supabase.rpc('create_helper_signup', {
    p_season_id: seasonId,
    p_availability: data.availability,
    p_interests: data.interests,
    p_first_name: data.first_name,
    p_last_name: data.last_name,
    p_mobile: data.mobile,
    p_email: data.email,
  })
  if (error || !id) throw new Error(error?.message || 'Anmeldung konnte nicht gespeichert werden.')

  const { error: emailError } = await supabase.functions.invoke('resend-email', {
    body: { type: 'helper-confirmation', helper_signup_id: id },
  })
  if (emailError) console.error('Failed to send helper confirmation:', emailError)
  return { emailSent: !emailError }
}
