import { useCallback, useEffect, useState } from 'react'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import './ServiceStatus.css'

type CheckState = 'ok' | 'degraded' | 'down' | 'loading'

type CheckResult = {
  name: string
  description: string
  state: CheckState
  detail: string
  latencyMs?: number
  link?: string
}

type StatuspageSummary = {
  status: { indicator: 'none' | 'minor' | 'major' | 'critical' | 'maintenance'; description: string }
  incidents?: Array<{ name: string; status: string }>
  scheduled_maintenances?: Array<{ name: string; status: string }>
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const TIMEOUT_MS = 10000
const EMAIL_FUNCTION = 'resend-email'
const RESEND_STATUS_FUNCTION = 'resend-status'

// Limits des Resend Free-Plans – bei einem Planwechsel hier anpassen
const RESEND_DAILY_LIMIT = 100
const RESEND_MONTHLY_LIMIT = 3000

type ResendStatus = {
  domains: Array<{ name: string; status: string }>
  rateLimit: { limit: number | null; remaining: number | null; resetSeconds: number | null }
  quota: { dailyUsed: number | null; monthlyUsed: number | null }
  counted: {
    sentToday: number
    sentThisMonth: number
    eventsThisMonth: Record<string, number>
    lastSentAt: string | null
    complete: boolean
  }
}

type ResendStatusResult = { data: ResendStatus } | { error: string }

// Measures how long an async check takes; aborts after TIMEOUT_MS
const timed = async <T,>(fn: (signal: AbortSignal) => Promise<T>): Promise<{ value: T; latencyMs: number }> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const start = performance.now()
  try {
    const value = await fn(controller.signal)
    return { value, latencyMs: Math.round(performance.now() - start) }
  } finally {
    clearTimeout(timeout)
  }
}

const errorText = (err: unknown) => {
  if (err instanceof DOMException && err.name === 'AbortError') return `Timeout nach ${TIMEOUT_MS / 1000}s`
  if (err instanceof Error) return err.message
  return String(err)
}

// Reads the response body of a failed edge function call (JSON or plain text)
const functionErrorBody = async (error: unknown): Promise<{ status?: number; message: string }> => {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response
    const text = await response.text().catch(() => '')
    let message = text
    try {
      const json = JSON.parse(text)
      message = json.error?.message ?? json.message ?? (typeof json.error === 'string' ? json.error : text)
    } catch {
      // body is not JSON, keep the raw text
    }
    return { status: response.status, message: message || `HTTP ${response.status}` }
  }
  return { message: errorText(error) }
}

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

// --- Verknüpfungs-Checks ---------------------------------------------------

const checkConfig = async (): Promise<CheckResult> => {
  const base = { name: 'Konfiguration', description: 'Env-Variablen in Vercel' }
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ...base, state: 'down', detail: 'VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt' }
  }
  const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1]
  if (!projectRef) {
    return { ...base, state: 'degraded', detail: `Unerwartetes URL-Format: ${supabaseUrl}` }
  }
  if (supabaseAnonKey.startsWith('sb_secret_')) {
    return { ...base, state: 'down', detail: 'Im Frontend ist ein Secret Key hinterlegt – sofort durch den Publishable Key ersetzen!' }
  }
  if (supabaseAnonKey.startsWith('sb_publishable_')) {
    return { ...base, state: 'ok', detail: `Projekt «${projectRef}», Publishable Key gesetzt` }
  }
  const payload = decodeJwtPayload(supabaseAnonKey)
  if (!payload) {
    return { ...base, state: 'down', detail: 'VITE_SUPABASE_ANON_KEY ist kein gültiger Schlüssel' }
  }
  if (payload.role === 'service_role') {
    return { ...base, state: 'down', detail: 'Im Frontend ist der service_role Key hinterlegt – sofort durch den anon Key ersetzen!' }
  }
  if (payload.ref && payload.ref !== projectRef) {
    return { ...base, state: 'down', detail: `Key gehört zu Projekt «${payload.ref}», URL zeigt auf «${projectRef}»` }
  }
  return { ...base, state: 'ok', detail: `Projekt «${projectRef}», URL und anon Key passen zusammen` }
}

const checkApiKey = async (): Promise<CheckResult> => {
  const base = { name: 'Supabase API', description: 'Erreichbarkeit & Schlüssel' }
  if (!supabaseUrl || !supabaseAnonKey) return { ...base, state: 'down', detail: 'Nicht konfiguriert' }
  try {
    const { value: res, latencyMs } = await timed((signal) =>
      fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey }, cache: 'no-store', signal })
    )
    if (res.status === 401 || res.status === 403) {
      return { ...base, state: 'down', detail: 'Schlüssel wird von Supabase abgelehnt', latencyMs }
    }
    if (!res.ok) return { ...base, state: 'down', detail: `HTTP ${res.status}`, latencyMs }
    return { ...base, state: 'ok', detail: 'Projekt erreichbar, Schlüssel akzeptiert', latencyMs }
  } catch (err) {
    return { ...base, state: 'down', detail: `Projekt nicht erreichbar (pausiert?): ${errorText(err)}` }
  }
}

const checkSession = async (): Promise<CheckResult> => {
  const base = { name: 'Admin-Login', description: 'Supabase Auth' }
  try {
    const { value: result, latencyMs } = await timed(() => supabase.auth.getUser())
    if (result.error || !result.data.user) {
      return { ...base, state: 'down', detail: result.error?.message ?? 'Keine gültige Session', latencyMs }
    }
    return { ...base, state: 'ok', detail: `Angemeldet als ${result.data.user.email}`, latencyMs }
  } catch (err) {
    return { ...base, state: 'down', detail: errorText(err) }
  }
}

const checkTables = async (): Promise<CheckResult> => {
  const base = { name: 'Datenbank-Tabellen', description: 'seasons, registrations, athletes' }
  const tables = ['seasons', 'registrations', 'athletes'] as const
  try {
    const { value: results, latencyMs } = await timed((signal) =>
      Promise.all(
        tables.map(async (table) => {
          const result = await supabase.from(table).select('id', { count: 'exact', head: true }).abortSignal(signal)
          return { table, ...result }
        })
      )
    )
    const failed = results.filter((r) => r.error)
    if (failed.length > 0) {
      return {
        ...base,
        state: 'down',
        detail: failed.map((r) => `${r.table}: ${r.error?.message || r.status}`).join(' · '),
        latencyMs,
      }
    }
    return { ...base, state: 'ok', detail: results.map((r) => `${r.table}: ${r.count ?? '?'}`).join(' · '), latencyMs }
  } catch (err) {
    return { ...base, state: 'down', detail: errorText(err) }
  }
}

// Fragt die Tabellen ohne Login ab – mit aktivem RLS darf dabei nichts zurückkommen
const checkDataProtection = async (): Promise<CheckResult> => {
  const base = { name: 'Datenschutz', description: 'Row Level Security' }
  if (!supabaseUrl || !supabaseAnonKey) return { ...base, state: 'down', detail: 'Nicht konfiguriert' }
  const tables = ['registrations', 'athletes'] as const
  try {
    const { value: results, latencyMs } = await timed((signal) =>
      Promise.all(
        tables.map(async (table) => {
          const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, {
            headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
            cache: 'no-store',
            signal,
          })
          const rows = res.ok ? ((await res.json()) as unknown[]) : []
          return { table, exposed: rows.length > 0 }
        })
      )
    )
    const exposed = results.filter((r) => r.exposed).map((r) => r.table)
    if (exposed.length > 0) {
      return {
        ...base,
        state: 'down',
        detail: `Ohne Login lesbar: ${exposed.join(', ')} – RLS aktivieren!`,
        latencyMs,
      }
    }
    return { ...base, state: 'ok', detail: 'Anmeldedaten sind ohne Admin-Login nicht lesbar', latencyMs }
  } catch (err) {
    return { ...base, state: 'degraded', detail: errorText(err) }
  }
}

const checkActiveSeason = async (): Promise<CheckResult> => {
  const base = { name: 'Aktive Saison', description: 'Anmeldeseite verwendet diese Saison' }
  try {
    const { value: result, latencyMs } = await timed(async (signal) =>
      await supabase.from('seasons').select('year, signup_deadline').eq('is_active', true).abortSignal(signal)
    )
    if (result.error) return { ...base, state: 'down', detail: result.error.message, latencyMs }
    const active = result.data ?? []
    if (active.length === 0) {
      return { ...base, state: 'degraded', detail: 'Keine Saison ist aktiv – Anmeldung nicht möglich', latencyMs }
    }
    if (active.length > 1) {
      return { ...base, state: 'degraded', detail: `${active.length} Saisons sind gleichzeitig aktiv`, latencyMs }
    }
    const season = active[0]
    const deadlinePassed = season.signup_deadline && new Date(season.signup_deadline) < new Date()
    return {
      ...base,
      state: 'ok',
      detail: `Saison ${season.year}${deadlinePassed ? ' (Anmeldeschluss vorbei)' : ''}`,
      latencyMs,
    }
  } catch (err) {
    return { ...base, state: 'down', detail: errorText(err) }
  }
}

// Calls the function without recipient: Resend must reject it, so no e-mail can go out,
// but the answer tells us whether the function is deployed and the Resend API key works.
const checkEmailFunction = async (): Promise<CheckResult> => {
  const base = { name: 'E-Mail Versand', description: `Edge Function «${EMAIL_FUNCTION}» → Resend` }
  try {
    const { value: result, latencyMs } = await timed(() => supabase.functions.invoke(EMAIL_FUNCTION, { body: {} }))
    if (!result.error) {
      return { ...base, state: 'degraded', detail: 'Testaufruf ohne Empfänger wurde unerwartet akzeptiert', latencyMs }
    }
    const { status, message } = await functionErrorBody(result.error)
    const lower = message.toLowerCase()
    if (status === 404) {
      return { ...base, state: 'down', detail: 'Edge Function ist nicht deployed', latencyMs }
    }
    if (lower.includes('api key') || lower.includes('api_key') || lower.includes('unauthorized') || status === 401 || status === 403) {
      return { ...base, state: 'down', detail: `Resend-Schlüssel fehlt oder ist ungültig: ${message}`, latencyMs }
    }
    if (lower.includes('domain') && (lower.includes('verif') || lower.includes('not found'))) {
      return { ...base, state: 'down', detail: `Absender-Domain bei Resend nicht verifiziert: ${message}`, latencyMs }
    }
    const isValidationError = /missing|required|validation|invalid .*(to|recipient)|`to`/.test(lower)
    if (status && status >= 500 && !isValidationError) {
      return { ...base, state: 'degraded', detail: `Function antwortet mit Fehler: ${message}`, latencyMs }
    }
    return {
      ...base,
      state: 'ok',
      detail: `Function deployed, Testaufruf wie erwartet abgelehnt (${message})`,
      latencyMs,
    }
  } catch (err) {
    return { ...base, state: 'down', detail: errorText(err) }
  }
}

// Unknown paths must be rewritten to index.html by vercel.json, otherwise deep links like /2026/edit/… break
const checkRouting = async (): Promise<CheckResult> => {
  const base = { name: 'Website & Routing', description: 'Vercel (Links in E-Mails)' }
  try {
    const { value: res, latencyMs } = await timed((signal) =>
      fetch(`${window.location.origin}/${new Date().getFullYear()}/edit/uptime-check`, { cache: 'no-store', signal })
    )
    const isHtml = res.headers.get('content-type')?.includes('text/html')
    if (!res.ok || !isHtml) {
      return { ...base, state: 'down', detail: `Bearbeitungslinks liefern HTTP ${res.status} – Rewrite in vercel.json prüfen`, latencyMs }
    }
    return { ...base, state: 'ok', detail: `${window.location.host} erreichbar, Bearbeitungslinks funktionieren`, latencyMs }
  } catch (err) {
    return { ...base, state: 'down', detail: errorText(err) }
  }
}

// --- Anbieter-Status ---------------------------------------------------------

const checkStatuspage = async (name: string, description: string, pageUrl: string): Promise<CheckResult> => {
  const base = { name, description, link: pageUrl }
  try {
    const { value: summary } = await timed(async (signal) => {
      const res = await fetch(`${pageUrl}/api/v2/summary.json`, { cache: 'no-store', signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as StatuspageSummary
    })
    const indicator = summary.status.indicator
    const state: CheckState =
      indicator === 'none' ? 'ok' : indicator === 'major' || indicator === 'critical' ? 'down' : 'degraded'
    const activeIncidents = (summary.incidents ?? []).filter((i) => i.status !== 'resolved' && i.status !== 'postmortem')
    const activeMaintenance = (summary.scheduled_maintenances ?? []).filter((m) => m.status === 'in_progress')
    const notes = [...activeIncidents, ...activeMaintenance].map((i) => i.name)
    const detail = notes.length > 0 ? `${summary.status.description}: ${notes.join(', ')}` : summary.status.description
    return { ...base, state, detail }
  } catch (err) {
    return { ...base, state: 'degraded', detail: `Statusseite nicht abrufbar (${errorText(err)})` }
  }
}

const fetchResendStatus = async (): Promise<ResendStatusResult> => {
  try {
    const { value: result } = await timed(() => supabase.functions.invoke<ResendStatus>(RESEND_STATUS_FUNCTION))
    if (result.error) {
      const { status, message } = await functionErrorBody(result.error)
      // Eine nicht deployte Function liefert 404 ohne CORS-Header – der Browser meldet das als Netzwerkfehler
      if (status === 404 || result.error instanceof FunctionsFetchError) {
        return { error: `Edge Function «${RESEND_STATUS_FUNCTION}» ist nicht deployed (supabase functions deploy ${RESEND_STATUS_FUNCTION})` }
      }
      return { error: message }
    }
    return result.data ? { data: result.data } : { error: 'Leere Antwort' }
  } catch (err) {
    return { error: errorText(err) }
  }
}

const runConnectionChecks = () =>
  Promise.all([
    checkConfig(),
    checkApiKey(),
    checkSession(),
    checkTables(),
    checkDataProtection(),
    checkActiveSeason(),
    checkEmailFunction(),
    checkRouting(),
  ])

const runProviderChecks = () =>
  Promise.all([
    checkStatuspage('Supabase', 'Datenbank, Auth & Edge Functions', 'https://status.supabase.com'),
    checkStatuspage('Vercel', 'Hosting', 'https://www.vercel-status.com'),
    checkStatuspage('Resend', 'E-Mail Versand', 'https://resend-status.com'),
  ])

const runAllChecks = () => Promise.all([runConnectionChecks(), runProviderChecks(), fetchResendStatus()])

const STATE_LABEL: Record<CheckState, string> = {
  ok: 'OK',
  degraded: 'Warnung',
  down: 'Fehler',
  loading: 'Prüfe…',
}

function StatusRow({ check }: { check: CheckResult }) {
  return (
    <div className={`service-status-row service-status-row-${check.state}`}>
      <span className={`service-status-dot service-status-dot-${check.state}`} aria-hidden="true" />
      <div className="service-status-info">
        <div className="service-status-name">
          {check.link ? (
            <a href={check.link} target="_blank" rel="noopener noreferrer">
              {check.name}
            </a>
          ) : (
            check.name
          )}
          <span className="service-status-description">{check.description}</span>
        </div>
        <div className="service-status-detail">{check.detail}</div>
      </div>
      <div className="service-status-meta">
        <span className={`service-status-badge service-status-badge-${check.state}`}>{STATE_LABEL[check.state]}</span>
        {check.latencyMs !== undefined && <span className="service-status-latency">{check.latencyMs} ms</span>}
      </div>
    </div>
  )
}

const usageState = (used: number, limit: number): CheckState =>
  used >= limit ? 'down' : used >= limit * 0.8 ? 'degraded' : 'ok'

function UsageBar({ label, used, limit, hint }: { label: string; used: number; limit: number; hint: string }) {
  const state = usageState(used, limit)
  const percent = Math.min(100, Math.round((used / limit) * 100))
  return (
    <div className="resend-usage">
      <div className="resend-usage-header">
        <span className="resend-usage-label">{label}</span>
        <span className="resend-usage-value">
          {used} / {limit}
        </span>
      </div>
      <div className="resend-usage-track">
        <div className={`resend-usage-fill resend-usage-fill-${state}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="resend-usage-hint">
        {limit - used > 0 ? `Noch ${limit - used} E-Mails` : 'Limit erreicht'} · {hint}
      </div>
    </div>
  )
}

const DOMAIN_STATUS_LABEL: Record<string, string> = {
  verified: 'Verifiziert',
  pending: 'Wird geprüft',
  not_started: 'Nicht eingerichtet',
  failed: 'Fehlgeschlagen',
  temporary_failure: 'Vorübergehender Fehler',
}

const EVENT_LABEL: Record<string, string> = {
  delivered: 'zugestellt',
  opened: 'geöffnet',
  clicked: 'geklickt',
  sent: 'unterwegs',
  delivery_delayed: 'verzögert',
  bounced: 'unzustellbar',
  complained: 'als Spam markiert',
  failed: 'fehlgeschlagen',
}

function ResendLimits({ result }: { result: ResendStatusResult | null }) {
  if (!result) return null
  if ('error' in result) {
    return (
      <div className="service-status-list">
        <StatusRow
          check={{ name: 'Resend Limits', description: `Edge Function «${RESEND_STATUS_FUNCTION}»`, state: 'degraded', detail: result.error }}
        />
      </div>
    )
  }

  const { domains, rateLimit, quota, counted } = result.data
  // Von Resend gemeldeter Verbrauch hat Vorrang, die eigene Zählung ist der Fallback
  const usedToday = quota.dailyUsed ?? counted.sentToday
  const usedThisMonth = quota.monthlyUsed ?? counted.sentThisMonth
  const source = quota.monthlyUsed !== null ? 'laut Resend' : counted.complete ? 'gezählt' : 'gezählt (unvollständig)'
  const problemEvents = ['bounced', 'complained', 'failed'].reduce(
    (sum, event) => sum + (counted.eventsThisMonth[event] ?? 0),
    0
  )
  const eventSummary = Object.entries(counted.eventsThisMonth)
    .sort(([, a], [, b]) => b - a)
    .map(([event, count]) => `${count} ${EVENT_LABEL[event] ?? event}`)
    .join(' · ')

  return (
    <>
      <div className="resend-usage-grid">
        <UsageBar label="Heute" used={usedToday} limit={RESEND_DAILY_LIMIT} hint={`${source}, Reset um 00:00 UTC`} />
        <UsageBar label="Diesen Monat" used={usedThisMonth} limit={RESEND_MONTHLY_LIMIT} hint={`${source}, Reset am 1. des Monats`} />
      </div>
      <div className="service-status-list">
        {domains.length === 0 ? (
          <StatusRow
            check={{ name: 'Absender-Domain', description: 'Resend', state: 'down', detail: 'Keine Domain bei Resend eingerichtet' }}
          />
        ) : (
          domains.map((domain) => (
            <StatusRow
              key={domain.name}
              check={{
                name: domain.name,
                description: 'Absender-Domain',
                state: domain.status === 'verified' ? 'ok' : domain.status === 'pending' ? 'degraded' : 'down',
                detail: DOMAIN_STATUS_LABEL[domain.status] ?? domain.status,
              }}
            />
          ))
        )}
        <StatusRow
          check={{
            name: 'Rate Limit',
            description: 'Anfragen pro Sekunde',
            state: rateLimit.remaining === 0 ? 'degraded' : 'ok',
            detail:
              rateLimit.limit !== null
                ? `${rateLimit.limit} Anfragen/s erlaubt, aktuell ${rateLimit.remaining ?? '?'} frei`
                : 'Keine Angabe von Resend',
          }}
        />
        <StatusRow
          check={{
            name: 'Zustellung',
            description: 'E-Mails diesen Monat',
            state: problemEvents > 0 ? 'degraded' : 'ok',
            detail:
              counted.sentThisMonth === 0
                ? 'Noch keine E-Mails diesen Monat'
                : `${eventSummary}${counted.lastSentAt ? ` · zuletzt ${new Date(counted.lastSentAt).toLocaleString('de-CH')}` : ''}`,
          }}
        />
      </div>
    </>
  )
}

function ServiceStatus() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [connectionChecks, setConnectionChecks] = useState<CheckResult[]>([])
  const [providerChecks, setProviderChecks] = useState<CheckResult[]>([])
  const [isChecking, setIsChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [resendStatus, setResendStatus] = useState<ResendStatusResult | null>(null)
  const [testEmailResult, setTestEmailResult] = useState<CheckResult | null>(null)
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false)

  const applyResults = useCallback(
    ([connections, providers, resend]: [CheckResult[], CheckResult[], ResendStatusResult]) => {
      setConnectionChecks(connections)
      setProviderChecks(providers)
      setResendStatus(resend)
      setLastChecked(new Date())
      setIsChecking(false)
    },
    []
  )

  const handleRefresh = () => {
    setIsChecking(true)
    runAllChecks().then(applyResults)
  }

  // Full end-to-end test: sends a real e-mail to the logged-in admin
  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true)
    const base = { name: 'Test-E-Mail', description: 'Echter Versand über Resend' }
    try {
      const { data } = await supabase.auth.getUser()
      const email = data.user?.email
      if (!email) {
        setTestEmailResult({ ...base, state: 'down', detail: 'Keine E-Mail-Adresse in der Admin-Session' })
        return
      }
      const { value: result, latencyMs } = await timed(() =>
        supabase.functions.invoke(EMAIL_FUNCTION, {
          body: {
            to: email,
            subject: 'HMK Anmeldung – Test-E-Mail',
            html: `<p>Diese Test-E-Mail wurde am ${new Date().toLocaleString('de-CH')} aus dem Admin-Dashboard versendet. Der E-Mail-Versand funktioniert.</p>`,
          },
        })
      )
      if (result.error) {
        const { message } = await functionErrorBody(result.error)
        setTestEmailResult({ ...base, state: 'down', detail: `Versand fehlgeschlagen: ${message}`, latencyMs })
      } else {
        setTestEmailResult({ ...base, state: 'ok', detail: `Gesendet an ${email} – bitte Posteingang prüfen`, latencyMs })
      }
    } catch (err) {
      setTestEmailResult({ ...base, state: 'down', detail: errorText(err) })
    } finally {
      setIsSendingTestEmail(false)
    }
  }

  useEffect(() => {
    if (!isExpanded) return
    runAllChecks().then(applyResults)
  }, [isExpanded, applyResults])

  const overall: CheckState =
    connectionChecks.length === 0
      ? 'loading'
      : connectionChecks.some((c) => c.state === 'down')
        ? 'down'
        : [...connectionChecks, ...providerChecks].some((c) => c.state !== 'ok')
          ? 'degraded'
          : 'ok'

  const overallLabel: Record<CheckState, string> = {
    ok: 'Alles verbunden',
    degraded: 'Warnungen',
    down: 'Probleme gefunden',
    loading: 'Prüfe…',
  }

  return (
    <div className="admin-section">
      <div className="service-status-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="service-status-title-wrapper">
          <h2 className="admin-section-title" style={{ margin: 0 }}>Systemstatus</h2>
          <span className={`service-status-badge service-status-badge-${overall}`}>{overallLabel[overall]}</span>
        </div>
        <span
          style={{
            fontSize: '1.25rem',
            transition: 'transform 0.2s',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▼
        </span>
      </div>
      {isExpanded && (
        <div className="service-status-body">
          <div className="service-status-toolbar">
            <span className="service-status-updated">
              {lastChecked ? `Zuletzt geprüft: ${lastChecked.toLocaleTimeString('de-CH')}` : 'Prüfe Dienste…'}
            </span>
            <div className="service-status-actions">
              <button
                className="admin-button admin-button-secondary"
                onClick={handleSendTestEmail}
                disabled={isSendingTestEmail}
              >
                {isSendingTestEmail ? 'Sende…' : 'Test-E-Mail an mich'}
              </button>
              <button className="admin-refresh-button" onClick={handleRefresh} disabled={isChecking}>
                {isChecking ? 'Prüfe…' : 'Erneut prüfen'}
              </button>
            </div>
          </div>

          <h3 className="service-status-group-title">Verknüpfungen</h3>
          <div className="service-status-list">
            {connectionChecks.map((check) => (
              <StatusRow key={check.name} check={check} />
            ))}
            {testEmailResult && <StatusRow check={testEmailResult} />}
          </div>

          <h3 className="service-status-group-title">Resend Limits</h3>
          <ResendLimits result={resendStatus} />

          <h3 className="service-status-group-title">Störungen bei Anbietern</h3>
          <div className="service-status-list">
            {providerChecks.map((check) => (
              <StatusRow key={check.name} check={check} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ServiceStatus
