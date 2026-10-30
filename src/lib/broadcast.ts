import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type ContactStatus = 'subscribed' | 'unsubscribed' | 'declined' | 'bounced' | 'complained'
export type ContactSource = 'legacy_registration' | 'registration_optin' | 'registration_declined' | 'csv_import' | 'manual'

export type NewsletterContact = {
  id: string
  email: string
  name: string | null
  club: string | null
  source: ContactSource
  consent_at: string | null
  consent_note: string | null
  status: ContactStatus
  created_at: string
}

export type BroadcastAttachment = { name: string; url: string; path: string }

export type BroadcastContent = {
  title: string
  body: string
  buttonLabel: string
  buttonUrl: string
  attachments: BroadcastAttachment[]
}

export type Broadcast = {
  id: string
  subject: string
  status: 'draft' | 'sending' | 'sent' | 'failed'
  recipient_count: number | null
  error: string | null
  sent_at: string | null
  created_at: string
}

export type BroadcastTemplate = {
  id: string
  name: string
  subject: string
  content: BroadcastContent
}

export type SignupHistory = Map<string, Array<{ year: number; athletes: number }>>

export type ImportRow = { email: string; name: string | null; club: string | null }
export type ImportPreview = { fresh: ImportRow[]; duplicates: number; invalid: number; unsubscribed: number }

export const STATUS_LABELS: Record<ContactStatus, string> = {
  subscribed: 'Aktiv',
  unsubscribed: 'Abgemeldet',
  declined: 'Deaktiviert',
  bounced: 'Unzustellbar',
  complained: 'Spam gemeldet',
}

export const SOURCE_LABELS: Record<ContactSource, string> = {
  legacy_registration: 'Altanmeldung',
  registration_optin: 'Haken bei Anmeldung',
  registration_declined: 'Haken abgewählt',
  csv_import: 'CSV-Import',
  manual: 'Manuell',
}

const ATTACHMENT_BUCKET = 'broadcast-attachments'
const UNSUBSCRIBE_URL = '{{{RESEND_UNSUBSCRIBE_URL}}}'
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const normalizeEmail = (value: string) => value.trim().toLowerCase()
export const isValidEmail = (value: string) => EMAIL_PATTERN.test(value)

// Calls the broadcast edge function and unwraps error messages
async function callBroadcast<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('broadcast', { body })
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

export async function loadContacts(): Promise<NewsletterContact[]> {
  const { data, error } = await supabase
    .from('newsletter_contacts')
    .select('id, email, name, club, source, consent_at, consent_note, status, created_at')
    .order('email')
  if (error) throw new Error(error.message)
  return data as NewsletterContact[]
}

export async function loadSignupHistory(): Promise<SignupHistory> {
  const { data, error } = await supabase.rpc('newsletter_contact_history')
  if (error) throw new Error(error.message)

  const history: SignupHistory = new Map()
  for (const row of data as Array<{ email: string; year: number; athlete_count: number }>) {
    const entries = history.get(row.email) ?? []
    entries.push({ year: row.year, athletes: row.athlete_count })
    history.set(row.email, entries)
  }
  return history
}

export async function loadBroadcasts(): Promise<Broadcast[]> {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('id, subject, status, recipient_count, error, sent_at, created_at')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Broadcast[]
}

export async function loadTemplates(): Promise<BroadcastTemplate[]> {
  const { data, error } = await supabase
    .from('broadcast_templates')
    .select('id, name, subject, content')
    .order('name')
  if (error) throw new Error(error.message)
  return data as BroadcastTemplate[]
}

export async function createTemplate(name: string, subject: string, content: BroadcastContent): Promise<string> {
  const { data, error } = await supabase
    .from('broadcast_templates')
    .insert({ name, subject, content })
    .select('id')
    .single()
  if (error) {
    throw new Error(error.code === '23505' ? 'Eine Vorlage mit diesem Namen existiert bereits.' : error.message)
  }
  return data.id
}

export async function updateTemplate(id: string, subject: string, content: BroadcastContent): Promise<void> {
  const { error } = await supabase
    .from('broadcast_templates')
    .update({ subject, content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('broadcast_templates').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function addContact(row: ImportRow): Promise<void> {
  const { error } = await supabase.from('newsletter_contacts').insert({
    ...row,
    source: 'manual',
    consent_at: new Date().toISOString(),
    consent_note: 'Manuell im Admin-Bereich erfasst',
  })
  if (error) {
    throw new Error(error.code === '23505' ? 'Diese Adresse ist bereits erfasst.' : error.message)
  }
}

// Existing contacts are skipped, so an import can never reactivate someone who unsubscribed
export async function importContacts(rows: ImportRow[]): Promise<void> {
  const { error } = await supabase.from('newsletter_contacts').upsert(
    rows.map((row) => ({
      ...row,
      source: 'manual',
      consent_at: new Date().toISOString(),
      consent_note: 'Eingefügte Liste, Zustimmung vom Admin bestätigt',
    })),
    { onConflict: 'email', ignoreDuplicates: true }
  )
  if (error) throw new Error(error.message)
}

export async function unsubscribeContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('newsletter_contacts')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString(), needs_sync: true })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export const deleteContact = (id: string) =>
  callBroadcast<{ message: string }>({ action: 'delete_contact', contact_id: id })

export async function uploadAttachment(file: File): Promise<BroadcastAttachment> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${crypto.randomUUID()}/${safeName}`
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, { contentType: 'application/pdf' })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path)
  return { name: file.name, url: data.publicUrl, path }
}

export async function removeAttachment(path: string): Promise<void> {
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([path])
  if (error) throw new Error(error.message)
}

// Resend erzeugt den Abmeldelink nur in Broadcasts, in Einzelmails bleibt er deshalb ein Hinweis
export const sendTestMail = (to: string, subject: string, html: string) =>
  callBroadcast<{ message: string }>({
    action: 'test',
    to,
    subject,
    html: html.replace(/<a href="\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}"[^>]*>Abmelden<\/a>/, 'Abmelden (nur im echten Versand aktiv)'),
  })

export async function sendBroadcast(subject: string, content: BroadcastContent, html: string): Promise<string> {
  // Vor dem Versand muss Resend alle Änderungen kennen
  let remaining = 1
  while (remaining > 0) {
    const result = await callBroadcast<{ synced: number; remaining: number }>({ action: 'sync' })
    remaining = result.remaining
  }

  const { data, error } = await supabase
    .from('broadcasts')
    .insert({ subject, content, html })
    .select('id')
    .single()
  if (error) throw new Error(error.message)

  const result = await callBroadcast<{ message: string }>({ action: 'send', broadcast_id: data.id })
  return result.message
}

// Accepts pasted addresses separated by line breaks, spaces, commas or semicolons
export const parseEmailList = (text: string): ImportRow[] =>
  text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((entry) => ({ email: normalizeEmail(entry), name: null, club: null }))

export function previewImport(rows: ImportRow[], contacts: NewsletterContact[]): ImportPreview {
  const known = new Map(contacts.map((contact) => [contact.email, contact.status]))
  const seen = new Set<string>()
  const preview: ImportPreview = { fresh: [], duplicates: 0, invalid: 0, unsubscribed: 0 }

  for (const row of rows) {
    if (!isValidEmail(row.email)) {
      preview.invalid += 1
    } else if (seen.has(row.email)) {
      preview.duplicates += 1
    } else if (known.has(row.email)) {
      seen.add(row.email)
      if (known.get(row.email) === 'subscribed') preview.duplicates += 1
      else preview.unsubscribed += 1
    } else {
      seen.add(row.email)
      preview.fresh.push(row)
    }
  }
  return preview
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const LINK_COLOR = '#303340'

export function buildBroadcastHtml({ title, body, buttonLabel, buttonUrl, attachments }: BroadcastContent) {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;">${escapeHtml(paragraph.trim()).replace(/\n/g, '<br />')}</p>`
    )
    .join('')
  const button =
    buttonLabel.trim() && buttonUrl.trim()
      ? `<p style="margin:24px 0;"><a href="${escapeHtml(buttonUrl.trim())}" style="display:inline-block;padding:12px 28px;border-radius:999px;background-color:${LINK_COLOR};color:#ffe400;text-decoration:none;font-weight:600;">${escapeHtml(buttonLabel.trim())}</a></p>`
      : ''
  const files =
    attachments.length > 0
      ? `<p style="margin:0 0 8px;font-weight:600;">Unterlagen</p><ul style="margin:0 0 16px;padding-left:20px;">${attachments
          .map(
            (file) =>
              `<li><a href="${escapeHtml(file.url)}" style="color:${LINK_COLOR};">${escapeHtml(file.name)}</a></li>`
          )
          .join('')}</ul>`
      : ''

  return `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#0f172a;max-width:600px;margin:0 auto;padding:24px;">
<h1 style="margin:0 0 24px;font-size:24px;color:${LINK_COLOR};">${escapeHtml(title.trim())}</h1>
${paragraphs}
${button}
${files}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;" />
<p style="margin:0;font-size:13px;color:#64748b;">SC Liestal, 4410 Liestal<br />Sie erhalten diese E-Mail im Zusammenhang mit dem SCL Hallenmehrkampf. <a href="${UNSUBSCRIBE_URL}" style="color:#64748b;">Abmelden</a></p>
</div>`
}
