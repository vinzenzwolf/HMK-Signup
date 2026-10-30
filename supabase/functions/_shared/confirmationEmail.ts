// Bestätigungsmail der Anmeldung. Wird von der Edge Function (Versand) und vom Adminpanel (Vorschau) genutzt.

export const CONTACT_EMAIL = 'vinzenzwolf1@gmail.com'

export const EDIT_LINK_PLACEHOLDER = '{{bearbeitungslink}}'

export const CONFIRMATION_PLACEHOLDERS = [
  '{{wettkampf}}',
  EDIT_LINK_PLACEHOLDER,
  '{{anmeldeschluss}}',
  '{{zahlungsfrist}}',
  '{{kontakt}}',
]

export const DEFAULT_CONFIRMATION_SUBJECT = 'Anmeldung {{wettkampf}} - Bearbeitungslink'

export const DEFAULT_CONFIRMATION_BODY = `Vielen Dank für deine Anmeldung. Über den folgenden Link kannst du deine Anmeldung bearbeiten:

{{bearbeitungslink}}

Du kannst die Anmeldung bis zum Anmeldeschluss am {{anmeldeschluss}} über den Link anpassen. Neu können auch nach dem Anmeldeschluss bis um 09:00 am Wettkampftag Athlet*innen über den Link abgemeldet werden! Bitte beachte, dass bei einer Abmeldung nach Anmeldeschluss die Startgebühr weiterhin zu bezahlen ist.

Bitte denk daran, die Teilnahmegebühr bis spätestens {{zahlungsfrist}} zu begleichen. Du kannst die Rechnung ebenfalls über den obenstehenden Link einsehen.

Bei Fragen oder Unklarheiten melde dich bitte bei {{kontakt}}.

Wir wünschen eine gute Vorbereitung!`

type ConfirmationSeason = {
  event_number: number | null
  year: number | null
  signup_deadline: string | null
  payment_deadline: string | null
}

export type ConfirmationTemplate = {
  subject: string | null
  body: string | null
}

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' }) : ''

export function renderConfirmationEmail(
  season: ConfirmationSeason | null,
  template: ConfirmationTemplate | null,
  editLink: string
) {
  let eventTitle = season?.event_number ? `${season.event_number}. SCL Hallenmehrkampf` : 'SCL Hallenmehrkampf'
  if (season?.year) eventTitle = `${eventTitle} ${season.year}`

  const values: Record<string, string> = {
    '{{wettkampf}}': eventTitle,
    [EDIT_LINK_PLACEHOLDER]: editLink,
    '{{anmeldeschluss}}': formatDate(season?.signup_deadline ?? null),
    '{{zahlungsfrist}}': formatDate(season?.payment_deadline ?? null),
    '{{kontakt}}': CONTACT_EMAIL,
  }
  const safeLink = escapeHtml(editLink)
  const htmlValues: Record<string, string> = {
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeHtml(value)])),
    [EDIT_LINK_PLACEHOLDER]: `<a href="${safeLink}">${safeLink}</a>`,
    '{{kontakt}}': `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`,
  }
  const fill = (text: string, replacements: Record<string, string>) =>
    text.replace(/\{\{[a-z]+\}\}/g, (placeholder) => replacements[placeholder] ?? placeholder)

  const subject = fill(template?.subject ?? DEFAULT_CONFIRMATION_SUBJECT, values).replace(/\s+/g, ' ').trim()
  const paragraphs = (template?.body ?? DEFAULT_CONFIRMATION_BODY)
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${fill(escapeHtml(paragraph), htmlValues).replace(/\n/g, '<br />')}</p>`)

  return { subject, html: `<h1>Anmeldung ${escapeHtml(eventTitle)}</h1>${paragraphs.join('')}` }
}
