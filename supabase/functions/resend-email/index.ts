// Versendet E-Mails über Resend.
// Deploy: supabase functions deploy resend-email --no-verify-jwt
//
// Zwei Modi:
//   { type: 'edit-link', edit_token, base_url? }
//       Öffentlich (Anmeldeformular). Die Mail wird hier aus der Anmeldung gebaut und nur an
//       die hinterlegte Adresse gesendet – Empfänger und Inhalt sind nicht frei wählbar.
//   { type: 'helper-confirmation', helper_signup_id }
//       Öffentlich (Helferformular). Bestätigung an die Adresse der Helferanmeldung,
//       nur in den ersten Minuten nach der Anmeldung.
//   { to, subject, html, attachments? }
//       Frei formulierte Mail (Rundmail, Test-Mail). Nur für angemeldete Admins.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FROM = 'SCL Hallenmehrkampf <noreply@scl-athletics.ch>'
const CONTACT_EMAIL = 'vinzenzwolf1@gmail.com'
const DEFAULT_BASE_URL = 'https://hmk.scl-athletics.ch'

// Nur diese Seiten dürfen in Bearbeitungslinks stehen
const ALLOWED_BASE_URLS = [
  /^https:\/\/hmk\.scl-athletics\.ch$/,
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

// Bestätigung nur kurz nach der Anmeldung, damit sich darüber keine wiederholten Mails auslösen lassen
const HELPER_CONFIRMATION_WINDOW_MS = 10 * 60 * 1000

const AVAILABILITY_FALLBACK: Record<string, string> = {
  ganzer_tag: 'Ganzer Tag',
  vormittag: 'Vormittag',
  nachmittag: 'Nachmittag',
}

const INTEREST_LABELS: Record<string, string> = {
  wirtschaft: 'in der Wirtschaft',
  anlagen: 'bei den Wettkampf-Anlagen',
}

// Ganztägiger Kalendereintrag für den Wettkampftag (eventDate im Format YYYY-MM-DD)
const buildEventIcs = (uid: string, eventDate: string) => {
  const start = eventDate.replace(/-/g, '')
  const next = new Date(`${eventDate}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const end = next.toISOString().slice(0, 10).replace(/-/g, '')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SC Liestal//Hallenmehrkampf//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@hallenmehrkampf.ch`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    'SUMMARY:Hallenmehrkampf',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

const sendHelperConfirmation = async (signupId: unknown) => {
  if (typeof signupId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signupId)) {
    return json({ error: "Missing or invalid 'helper_signup_id'" }, 400)
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: signup, error } = await admin
    .from('helper_signups')
    .select('first_name, email, availability, interests, created_at, season:seasons(year, event_date, helper_form:helper_forms(morning_label, afternoon_label, contact_email))')
    .eq('id', signupId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load helper signup', error)
    return json({ error: 'Helferanmeldung konnte nicht geladen werden' }, 500)
  }
  if (!signup) {
    return json({ error: 'Helferanmeldung nicht gefunden' }, 404)
  }
  if (Date.now() - new Date(signup.created_at).getTime() > HELPER_CONFIRMATION_WINDOW_MS) {
    return json({ error: 'Bestätigung kann nur direkt nach der Anmeldung versendet werden' }, 409)
  }

  const season = signup.season as {
    year: number
    event_date: string
    helper_form: { morning_label: string; afternoon_label: string; contact_email: string | null } | null
  } | null

  const availabilityText =
    signup.availability === 'vormittag'
      ? season?.helper_form?.morning_label
      : signup.availability === 'nachmittag'
        ? season?.helper_form?.afternoon_label
        : undefined
  const eventDate = season?.event_date
    ? new Date(season.event_date).toLocaleDateString('de-CH', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Zurich',
      })
    : null
  const interests = (signup.interests as string[]).map((interest) => INTEREST_LABELS[interest] ?? interest)
  const contactEmail = season?.helper_form?.contact_email ? escapeHtml(season.helper_form.contact_email) : null

  const html = `
    <h1>Helferanmeldung SCL Hallenmehrkampf${season?.year ? ` ${season.year}` : ''}</h1>
    <p>Hallo ${escapeHtml(signup.first_name)}</p>
    <p>Vielen Dank für Ihre Anmeldung als Helfer${eventDate ? ` am Hallenmehrkampf vom ${eventDate}` : ''}. Wir haben folgende Angaben erhalten:</p>
    <ul>
      <li>Einsatz: ${escapeHtml(availabilityText ?? AVAILABILITY_FALLBACK[signup.availability] ?? signup.availability)}</li>
      ${interests.length > 0 ? `<li>Interesse: ${escapeHtml(interests.join(', '))}</li>` : ''}
    </ul>
    <p>Die genaue Einteilung erhalten Sie vor dem Wettkampf.${
      contactEmail
        ? ` Bei Fragen oder Änderungen melden Sie sich bitte unter <a href="mailto:${contactEmail}">${contactEmail}</a>.`
        : ''
    }</p>
    ${season?.event_date ? '<p>Im Anhang finden Sie den Wettkampftag als Kalendereintrag.</p>' : ''}
  `

  return sendViaResend({
    to: signup.email,
    subject: `Helferanmeldung SCL Hallenmehrkampf${season?.year ? ` ${season.year}` : ''}`,
    html,
    ...(contactEmail ? { reply_to: contactEmail } : {}),
    ...(season?.event_date
      ? {
          attachments: [
            {
              filename: 'hallenmehrkampf.ics',
              content: btoa(buildEventIcs(signupId, season.event_date)),
              content_type: 'text/calendar; charset=utf-8; method=PUBLISH',
            },
          ],
        }
      : {}),
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

  if (payload?.type === 'helper-confirmation') {
    return sendHelperConfirmation(payload.helper_signup_id)
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
