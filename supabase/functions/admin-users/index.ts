// Benutzerverwaltung für Systemadmins: Logins einladen, Rollen vergeben, Passwort-Reset, Löschen.
// Deploy: supabase functions deploy admin-users
//
// Einladungs- und Reset-Mails werden über Resend verschickt. Der Link enthält nur einen
// Einmal-Token, den die Seite /admin/passwort per verifyOtp einlöst – so braucht es keine
// Redirect-URL-Konfiguration in Supabase Auth.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const FROM = 'SCL Hallenmehrkampf <noreply@scl-athletics.ch>'
const DEFAULT_BASE_URL = 'https://hmk.scl-athletics.ch'
const ALLOWED_BASE_URLS = [
  /^https:\/\/hmk\.scl-athletics\.ch$/,
  /^https:\/\/hallenmehrkampf\.ch$/,
  /^https:\/\/hmk-signup(-[a-z0-9-]+)?\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
]
// Die Systemadmin-Rolle wird nicht über die Oberfläche vergeben
const ASSIGNABLE_ROLES = ['registrations', 'helpers']

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

const resolveBaseUrl = (value: unknown) =>
  typeof value === 'string' && ALLOWED_BASE_URLS.some((pattern) => pattern.test(value)) ? value : DEFAULT_BASE_URL

const sanitizeRoles = (value: unknown) =>
  Array.isArray(value) ? ASSIGNABLE_ROLES.filter((role) => value.includes(role)) : []

const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)

const sendMail = async (to: string, subject: string, html: string) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Resend antwortet mit HTTP ${res.status}`)
  }
}

const sendAccessLink = async (email: string, type: 'invite' | 'recovery', baseUrl: string) => {
  const { data, error } = await admin.auth.admin.generateLink({ type, email })
  if (error || !data.properties?.hashed_token) throw new Error(error?.message ?? 'Link konnte nicht erstellt werden')

  const link = `${baseUrl}/admin/passwort?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${type}`
  const isInvite = type === 'invite'
  await sendMail(
    email,
    isInvite ? 'Einladung: Admin-Bereich SCL Hallenmehrkampf' : 'Passwort zurücksetzen: SCL Hallenmehrkampf',
    `
      <h1>${isInvite ? 'Einladung zum Admin-Bereich' : 'Passwort zurücksetzen'}</h1>
      <p>${
        isInvite
          ? 'Sie wurden für den Admin-Bereich des SCL Hallenmehrkampf freigeschaltet. Über den folgenden Link legen Sie Ihr Passwort fest:'
          : 'Über den folgenden Link legen Sie ein neues Passwort fest:'
      }</p>
      <p><a href="${link}">Passwort festlegen</a></p>
      <p>Der Link ist nur einmal und für kurze Zeit gültig. Falls Sie diese E-Mail nicht erwartet haben, können Sie sie ignorieren.</p>
    `
  )
  return data.user
}

const listUsers = async () => {
  const [{ data: usersData, error }, { data: roleRows, error: rolesError }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from('admin_users').select('user_id, roles'),
  ])
  if (error) throw error
  if (rolesError) throw rolesError

  const rolesByUser = new Map((roleRows ?? []).map((row) => [row.user_id, row.roles as string[]]))
  return usersData.users
    .map((user) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      confirmed: Boolean(user.email_confirmed_at),
      roles: rolesByUser.get(user.id) ?? [],
    }))
    .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))
}

const setRoles = async (userId: string, roles: string[]) => {
  const { error } = await admin.from('admin_users').upsert({ user_id: userId, roles })
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Nur Systemadmins
  const authorization = req.headers.get('Authorization') ?? ''
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } })
  const { data: userData } = await caller.auth.getUser()
  const { data: myRoles } = await caller.rpc('my_admin_roles')
  if (!userData.user || !(myRoles as string[] | null)?.includes('system')) {
    return json({ error: 'Nur für Systemadmins' }, 403)
  }
  const callerId = userData.user.id

  let payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  try {
    switch (payload?.action) {
      case 'list':
        return json({ users: await listUsers() })

      case 'invite': {
        const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
        if (!isValidEmail(email)) return json({ error: 'Ungültige E-Mail-Adresse' }, 400)
        const roles = sanitizeRoles(payload.roles)
        if (roles.length === 0) return json({ error: 'Mindestens eine Rolle wählen' }, 400)

        const existing = (await listUsers()).find((user) => user.email === email)
        if (existing) {
          if (existing.roles.includes('system')) return json({ error: 'Systemadmin kann nicht geändert werden' }, 400)
          await setRoles(existing.id, roles)
          return json({ users: await listUsers(), message: 'Login existiert bereits – Rollen wurden aktualisiert.' })
        }

        const user = await sendAccessLink(email, 'invite', resolveBaseUrl(payload.base_url))
        await setRoles(user.id, roles)
        return json({ users: await listUsers(), message: `Einladung an ${email} gesendet.` })
      }

      case 'update_roles': {
        if (payload.user_id === callerId) return json({ error: 'Eigene Rollen können nicht geändert werden' }, 400)
        const target = (await listUsers()).find((user) => user.id === payload.user_id)
        if (!target) return json({ error: 'Benutzer nicht gefunden' }, 404)
        if (target.roles.includes('system')) return json({ error: 'Systemadmin kann nicht geändert werden' }, 400)
        await setRoles(target.id, sanitizeRoles(payload.roles))
        return json({ users: await listUsers(), message: 'Rollen gespeichert.' })
      }

      case 'send_reset': {
        const target = (await listUsers()).find((user) => user.id === payload.user_id)
        if (!target?.email) return json({ error: 'Benutzer nicht gefunden' }, 404)
        await sendAccessLink(target.email, target.confirmed ? 'recovery' : 'invite', resolveBaseUrl(payload.base_url))
        return json({ users: await listUsers(), message: `Link zum Passwort-Festlegen an ${target.email} gesendet.` })
      }

      case 'delete': {
        if (payload.user_id === callerId) return json({ error: 'Eigener Login kann nicht gelöscht werden' }, 400)
        const target = (await listUsers()).find((user) => user.id === payload.user_id)
        if (!target) return json({ error: 'Benutzer nicht gefunden' }, 404)
        if (target.roles.includes('system')) return json({ error: 'Systemadmin kann nicht gelöscht werden' }, 400)
        const { error } = await admin.auth.admin.deleteUser(target.id)
        if (error) throw error
        return json({ users: await listUsers(), message: `Login ${target.email} gelöscht.` })
      }

      default:
        return json({ error: 'Unbekannte Aktion' }, 400)
    }
  } catch (err) {
    console.error('admin-users failed', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
