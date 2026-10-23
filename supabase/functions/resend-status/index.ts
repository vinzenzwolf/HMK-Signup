// Liefert Limits, Verbrauch und Domain-Status von Resend für das Admin-Dashboard.
// Deploy: supabase functions deploy resend-status
// Benötigt das Secret RESEND_STATUS_API_KEY (Full-Access-Key) oder fällt auf RESEND_API_KEY zurück.
// Ein "Sending access"-Key reicht nicht, weil /domains und /emails gelesen werden.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API = 'https://api.resend.com'
// Schutz gegen endloses Paginieren: max. 40 × 100 E-Mails pro Monat werden gezählt
const MAX_PAGES = 40

type ResendEmail = { id: string; created_at: string; last_event: string | null }
type ResendList<T> = { data: T[]; has_more?: boolean }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Resend liefert Postgres-Zeitstempel wie "2026-04-03 22:13:42.674981+00", die Date nicht direkt versteht
const parseResendDate = (value: string) =>
  new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).getTime()

const numberHeader = (headers: Headers, name: string) => {
  const value = headers.get(name)
  return value === null || value === '' || Number.isNaN(Number(value)) ? null : Number(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Nur Systemadmins dürfen die Daten sehen
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return json({ error: 'Nicht angemeldet' }, 401)
  const { data: myRoles } = await supabase.rpc('my_admin_roles')
  if (!(myRoles as string[] | null)?.includes('system')) return json({ error: 'Nur für Systemadmins' }, 403)

  const apiKey = Deno.env.get('RESEND_STATUS_API_KEY') ?? Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return json({ error: 'Secret RESEND_STATUS_API_KEY bzw. RESEND_API_KEY fehlt' }, 500)

  const resendFetch = async (path: string) => {
    const res = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const error = new Error(body.message ?? `Resend antwortet mit HTTP ${res.status}`) as Error & {
        status: number
        name: string
      }
      error.status = res.status
      error.name = body.name ?? 'resend_error'
      throw error
    }
    return { body, headers: res.headers }
  }

  try {
    const domainsResponse = await resendFetch('/domains')
    const domains = (domainsResponse.body as ResendList<{ name: string; status: string }>).data.map((d) => ({
      name: d.name,
      status: d.status,
    }))

    // Versendete E-Mails des laufenden Monats (UTC) zählen – Resend liefert neueste zuerst
    const now = new Date()
    const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const startOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    let sentToday = 0
    let sentThisMonth = 0
    const eventsThisMonth: Record<string, number> = {}
    let lastSentAt: string | null = null
    let countComplete = false
    let latestHeaders = domainsResponse.headers
    let after: string | null = null

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await resendFetch(`/emails?limit=100${after ? `&after=${after}` : ''}`)
      latestHeaders = response.headers
      const { data, has_more } = response.body as ResendList<ResendEmail>
      let reachedOlderMonth = false

      for (const email of data) {
        const createdAt = parseResendDate(email.created_at)
        lastSentAt ??= new Date(createdAt).toISOString()
        if (createdAt < startOfMonth) {
          reachedOlderMonth = true
          break
        }
        sentThisMonth += 1
        if (createdAt >= startOfDay) sentToday += 1
        const event = email.last_event ?? 'unknown'
        eventsThisMonth[event] = (eventsThisMonth[event] ?? 0) + 1
      }

      if (reachedOlderMonth || !has_more || data.length === 0) {
        countComplete = true
        break
      }
      after = data[data.length - 1].id
    }

    return json({
      domains,
      rateLimit: {
        limit: numberHeader(latestHeaders, 'ratelimit-limit'),
        remaining: numberHeader(latestHeaders, 'ratelimit-remaining'),
        resetSeconds: numberHeader(latestHeaders, 'ratelimit-reset'),
      },
      // Von Resend gemeldeter Verbrauch (Daily-Header gibt es nur im Free-Plan)
      quota: {
        dailyUsed: numberHeader(latestHeaders, 'x-resend-daily-quota'),
        monthlyUsed: numberHeader(latestHeaders, 'x-resend-monthly-quota'),
      },
      // Selbst gezählt über die E-Mail-Liste, als Fallback falls die Header fehlen
      counted: { sentToday, sentThisMonth, eventsThisMonth, lastSentAt, complete: countComplete },
    })
  } catch (err) {
    const error = err as Error & { status?: number }
    if (error.name === 'restricted_api_key') {
      return json(
        {
          error:
            'Der Resend-Key hat nur Sende-Rechte. Bitte einen Full-Access-Key als Secret RESEND_STATUS_API_KEY hinterlegen.',
        },
        403
      )
    }
    return json({ error: error.message }, error.status && error.status < 500 ? error.status : 502)
  }
})
