// Versendet E-Mails über Resend.
// Deploy: supabase functions deploy resend-email --no-verify-jwt
//
// Zwei Modi:
//   { type: 'edit-link', edit_token, base_url? }
//       Öffentlich (Anmeldeformular). Die Mail wird hier aus der Anmeldung gebaut und nur an
//       die hinterlegte Adresse gesendet – Empfänger und Inhalt sind nicht frei wählbar.
//   { to, subject, html, attachments? }
//       Frei formulierte Mail (Rundmail, Test-Mail). Nur für angemeldete Admins.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FROM = 'SCL Hallenmehrkampf <noreply@hallenmehrkampf.ch>'
const CONTACT_EMAIL = 'vinzenzwolf1@gmail.com'
const DEFAULT_BASE_URL = 'https://hallenmehrkampf.ch'

// Nur diese Seiten dürfen in Bearbeitungslinks stehen
const ALLOWED_BASE_URLS = [
  /^https:\/\/hallenmehrkampf\.ch$/,
  /^https:\/\/hmk-signup(-[a-z0-9-]+)?\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
]

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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' }) : null

const sendViaResend = async (body: Record<string, unknown>) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM, ...body }),
  })
  const data = await res.json().catch(() => ({}))
  return json(data, res.ok ? 200 : 500)
}

const sendEditLink = async (editToken: unknown, requestedBaseUrl: unknown) => {
  if (typeof editToken !== 'string' || editToken.length === 0) {
    return json({ error: "Missing 'edit_token'" }, 400)
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: registration, error } = await admin
    .from('registrations')
    .select('email, season:seasons(event_number, year, signup_deadline, payment_deadline)')
    .eq('edit_token', editToken)
    .maybeSingle()

  if (error) {
    console.error('Failed to load registration', error)
    return json({ error: 'Anmeldung konnte nicht geladen werden' }, 500)
  }
  if (!registration) {
    return json({ error: 'Anmeldung nicht gefunden' }, 404)
  }

  const season = registration.season as {
    event_number: number | null
    year: number | null
    signup_deadline: string | null
    payment_deadline: string | null
  } | null

  const baseUrl =
    typeof requestedBaseUrl === 'string' && ALLOWED_BASE_URLS.some((pattern) => pattern.test(requestedBaseUrl))
      ? requestedBaseUrl
      : DEFAULT_BASE_URL

  let eventTitle = season?.event_number ? `${season.event_number}. SCL Hallenmehrkampf` : 'SCL Hallenmehrkampf'
  if (season?.year) eventTitle = `${eventTitle} ${season.year}`
  const editPath = season?.year ? `/${season.year}/edit/${editToken}` : `/edit/${editToken}`
  const editLink = escapeHtml(`${baseUrl}${editPath}`)
  const signupDeadlineText = formatDate(season?.signup_deadline ?? null)
  const paymentDeadlineText = formatDate(season?.payment_deadline ?? null)

  const html = `
    <h1>Anmeldung ${escapeHtml(eventTitle)}</h1>
    <p>Vielen Dank für Ihre Anmeldung. Über den folgenden Link können Sie Ihre Anmeldung bearbeiten:</p>
    <p>
      <a href="${editLink}">${editLink}</a>
    </p>
    <p>
      ${
        signupDeadlineText
          ? `Sie können Ihre Anmeldung bis zum Anmeldeschluss am ${signupDeadlineText} über den Link anpassen. Danach sind Änderungen nicht mehr möglich.`
          : 'Sie können Ihre Anmeldung bis zum Anmeldeschluss über den Link anpassen. Danach sind Änderungen nicht mehr möglich.'
      }
      ${
        paymentDeadlineText
          ? `<p>Bitte denken Sie daran, die Teilnahmegebühr bis spätestens ${paymentDeadlineText} zu begleichen. Sie können die Rechnung ebenfalls über den obenstehenden Link einsehen.</p>`
          : ''
      }
    </p>
    <p>Bei Fragen oder Unklarheiten melden Sie sich bitte unter <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  `

  return sendViaResend({
    to: registration.email,
    subject: `Ihre Anmeldung ${eventTitle} - Bearbeitungslink`,
    html,
  })
}

const isAdminRequest = async (req: Request) => {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return false
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return false
  const { data: isAdmin } = await supabase.rpc('is_admin')
  return isAdmin === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  let payload
  try {
    payload = await req.json()
  } catch (error) {
    console.error('Invalid JSON body', error)
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (payload?.type === 'edit-link') {
    return sendEditLink(payload.edit_token, payload.base_url)
  }

  if (!(await isAdminRequest(req))) {
    return json({ error: 'Nur für Admins' }, 403)
  }

  const { to, subject, html, attachments } = payload ?? {}
  if (!to || !subject || !html) {
    return json({ error: "Missing 'to', 'subject' or 'html'" }, 400)
  }

  return sendViaResend({
    to,
    subject,
    html,
    ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {}),
  })
})
