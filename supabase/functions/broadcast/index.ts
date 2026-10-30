// Versendet Broadcasts über Resend und gleicht die Empfängerliste ab.
// Deploy: supabase functions deploy broadcast
// Benötigt RESEND_SEGMENT_ID und einen Full-Access-Key (RESEND_STATUS_API_KEY, sonst RESEND_API_KEY).
//
// Aktionen (nur Rolle «broadcast»):
//   { action: 'sync' }                         überträgt geänderte Kontakte portionenweise, liefert 'remaining'
//   { action: 'test', to, subject, html }      Testmail an eine Adresse
//   { action: 'send', broadcast_id }           versendet einen Entwurf an das Segment
//   { action: 'delete_contact', contact_id }   löscht einen Kontakt bei Resend und lokal
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API = 'https://api.resend.com'
const RESEND_API_KEY = Deno.env.get('RESEND_STATUS_API_KEY') ?? Deno.env.get('RESEND_API_KEY')
const RESEND_SEGMENT_ID = Deno.env.get('RESEND_SEGMENT_ID')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FROM = 'SCL Hallenmehrkampf <noreply@scl-athletics.ch>'
const REPLY_TO = 'info@scl-athletics.ch'
const UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}'

// Resend erlaubt 10 Requests pro Sekunde; die Portion muss ins Zeitlimit der Function passen
const REQUEST_DELAY_MS = 150
const SYNC_BATCH_SIZE = 100
const MAX_RETRIES = 3

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const resendFetch = async (path: string, method: string, body?: unknown): Promise<Response> => {
  for (let attempt = 0; ; attempt += 1) {
    await sleep(REQUEST_DELAY_MS)
    const res = await fetch(`${RESEND_API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res
    await sleep(Number(res.headers.get('retry-after') ?? 1) * 1000)
  }
}

const resendError = async (res: Response) => {
  const body = await res.json().catch(() => ({}))
  return new Error(body.message ?? `Resend antwortet mit HTTP ${res.status}`)
}

type Contact = { id: string; email: string; name: string | null; status: string }

const splitName = (name: string | null) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') }
}

const pushContact = async (contact: Contact) => {
  const path = `/contacts/${encodeURIComponent(contact.email)}`
  const unsubscribed = contact.status !== 'subscribed'
  const fields = { ...splitName(contact.name), unsubscribed }

  const updated = await resendFetch(path, 'PATCH', fields)
  if (updated.status === 404) {
    // Wer bei Resend nie bekannt war, muss auch nicht als abgemeldet angelegt werden
    if (unsubscribed) return
    const created = await resendFetch('/contacts', 'POST', { email: contact.email, ...fields })
    if (!created.ok) throw await resendError(created)
  } else if (!updated.ok) {
    throw await resendError(updated)
  }

  if (!unsubscribed) {
    const added = await resendFetch(`${path}/segments/${RESEND_SEGMENT_ID}`, 'POST')
    if (!added.ok) throw await resendError(added)
  }
}

const countPending = async () => {
  const { count, error } = await admin
    .from('newsletter_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('needs_sync', true)
  if (error) throw error
  return count ?? 0
}

const syncContacts = async () => {
  const { data: contacts, error } = await admin
    .from('newsletter_contacts')
    .select('id, email, name, status')
    .eq('needs_sync', true)
    .limit(SYNC_BATCH_SIZE)
  if (error) throw error

  for (const contact of contacts as Contact[]) {
    await pushContact(contact)
    const { error: updateError } = await admin
      .from('newsletter_contacts')
      .update({ needs_sync: false, synced_at: new Date().toISOString() })
      .eq('id', contact.id)
    if (updateError) throw updateError
  }

  return { synced: contacts.length, remaining: await countPending() }
}

const sendTest = async (to: unknown, subject: unknown, html: unknown) => {
  if (typeof to !== 'string' || typeof subject !== 'string' || typeof html !== 'string') {
    return json({ error: "Missing 'to', 'subject' or 'html'" }, 400)
  }
  const res = await resendFetch('/emails', 'POST', {
    from: FROM,
    reply_to: REPLY_TO,
    to,
    subject: `[Test] ${subject}`,
    html: html.replaceAll(UNSUBSCRIBE_PLACEHOLDER, '#'),
  })
  if (!res.ok) throw await resendError(res)
  return json({ message: `Testmail an ${to} gesendet.` })
}

const sendBroadcast = async (broadcastId: unknown) => {
  if (typeof broadcastId !== 'string') return json({ error: "Missing 'broadcast_id'" }, 400)

  if ((await countPending()) > 0) {
    return json({ error: 'Es sind noch nicht alle Empfänger abgeglichen.' }, 409)
  }

  // Bedingtes Update: ein zweiter Klick findet den Entwurf nicht mehr und versendet nichts
  const { data: broadcast, error } = await admin
    .from('broadcasts')
    .update({ status: 'sending', error: null })
    .eq('id', broadcastId)
    .eq('status', 'draft')
    .select('id, subject, html')
    .maybeSingle()
  if (error) throw error
  if (!broadcast) return json({ error: 'Broadcast wurde bereits versendet.' }, 409)

  try {
    if (!broadcast.html.includes(UNSUBSCRIBE_PLACEHOLDER)) throw new Error('Der Abmeldelink fehlt in der Mail.')

    const { count, error: countError } = await admin
      .from('newsletter_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'subscribed')
    if (countError) throw countError

    const res = await resendFetch('/broadcasts', 'POST', {
      segment_id: RESEND_SEGMENT_ID,
      from: FROM,
      reply_to: REPLY_TO,
      subject: broadcast.subject,
      html: broadcast.html,
      name: broadcast.subject,
      send: true,
    })
    if (!res.ok) throw await resendError(res)
    const { id } = await res.json()

    await admin
      .from('broadcasts')
      .update({ status: 'sent', resend_broadcast_id: id, recipient_count: count, sent_at: new Date().toISOString() })
      .eq('id', broadcast.id)

    return json({ message: `Broadcast an ${count} Empfänger versendet.` })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from('broadcasts').update({ status: 'failed', error: message }).eq('id', broadcast.id)
    throw err
  }
}

const deleteContact = async (contactId: unknown) => {
  if (typeof contactId !== 'string') return json({ error: "Missing 'contact_id'" }, 400)

  const { data: contact, error } = await admin
    .from('newsletter_contacts')
    .select('email')
    .eq('id', contactId)
    .maybeSingle()
  if (error) throw error
  if (!contact) return json({ error: 'Kontakt nicht gefunden' }, 404)

  const res = await resendFetch(`/contacts/${encodeURIComponent(contact.email)}`, 'DELETE')
  if (!res.ok && res.status !== 404) throw await resendError(res)

  const { error: deleteError } = await admin.from('newsletter_contacts').delete().eq('id', contactId)
  if (deleteError) throw deleteError
  return json({ message: `${contact.email} gelöscht.` })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await caller.auth.getUser()
  const { data: allowed } = await caller.rpc('has_admin_role', { p_role: 'broadcast' })
  if (!userData.user || allowed !== true) return json({ error: 'Nur für Broadcast-Admins' }, 403)

  if (!RESEND_SEGMENT_ID) return json({ error: 'Secret RESEND_SEGMENT_ID ist nicht gesetzt' }, 500)

  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    switch (payload?.action) {
      case 'sync':
        return json(await syncContacts())
      case 'test':
        return await sendTest(payload.to, payload.subject, payload.html)
      case 'send':
        return await sendBroadcast(payload.broadcast_id)
      case 'delete_contact':
        return await deleteContact(payload.contact_id)
      default:
        return json({ error: 'Unbekannte Aktion' }, 400)
    }
  } catch (err) {
    console.error('broadcast failed', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
