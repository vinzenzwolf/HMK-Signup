import { supabase } from './supabase'

export const sendEditLinkEmail = async (
  email: string,
  token: string,
  _registrationId: string
): Promise<string> => {
  const envBaseUrl =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env.VITE_SITE_URL ||
        (import.meta as any).env.PUBLIC_SITE_URL ||
        (import.meta as any).env.NEXT_PUBLIC_SITE_URL ||
        ''
      : ''

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : envBaseUrl

  let editPath = `/edit/${token}`

  // Try to enrich the email with season context (event number + deadlines)
  let eventTitle = 'SCL Hallenmehrkampf'
  let signupDeadlineText: string | null = null
  let paymentDeadlineText: string | null = null

  try {
    const { data: registration } = await supabase
      .from('registrations')
      .select('season_id')
      .eq('id', _registrationId)
      .maybeSingle()

    if (registration?.season_id) {
      const { data: season } = await supabase
        .from('seasons')
        .select('event_number, year, signup_deadline, payment_deadline')
        .eq('id', registration.season_id)
        .maybeSingle()

      if (season) {
        eventTitle = season.event_number
          ? `${season.event_number}. SCL Hallenmehrkampf`
          : eventTitle
        signupDeadlineText = season.signup_deadline
          ? new Date(season.signup_deadline).toLocaleDateString('de-CH')
          : null
        paymentDeadlineText = season.payment_deadline
          ? new Date(season.payment_deadline).toLocaleDateString('de-CH')
          : null
        // Include year when available for clarity and use it for the edit link route
        if (season.year) {
          eventTitle = `${eventTitle} ${season.year}`
          editPath = `/${season.year}/edit/${token}`
        }
      }
    }
  } catch (contextError) {
    console.warn('Could not enrich edit-link email with season info:', contextError)
  }

  const editLink = `${baseUrl || ''}${editPath}`

  // HTML content for the email that the Supabase Edge Function will send via Resend
  const html = `
    <h1>Anmeldung ${eventTitle}</h1>
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
    <p>Bei Fragen oder Unklarheiten melden Sie sich bitte unter <a href="mailto:vinzenzwolf1@gmail.com">vinzenzwolf1@gmail.com</a>.</p>
  `

  try {
    if (supabase) {
      const { error } = await supabase.functions.invoke('resend-email', {
        body: {
          to: email,
          subject: `Ihre Anmeldung ${eventTitle} - Bearbeitungslink`,
          html
        },
      })

      if (error) {
        console.error('Error invoking resend-email function:', error)
        // Throw a specific error that can be caught and handled
        const emailError = new Error(`E-Mail konnte nicht versendet werden: ${error.message || 'Ungültige E-Mail-Adresse'}`)
        ;(emailError as any).isEmailError = true
        ;(emailError as any).emailAddress = email
        throw emailError
      }
    } else {
      console.warn('Supabase client not configured, skipping email send')
      const emailError = new Error('E-Mail-Service nicht konfiguriert')
      ;(emailError as any).isEmailError = true
      throw emailError
    }
  } catch (error) {
    console.error('Error sending email via resend-email function:', error)
    // Re-throw if it's already our custom error
    if (error instanceof Error && (error as any).isEmailError) {
      throw error
    }
    // Otherwise wrap it
    const emailError = new Error(`E-Mail konnte nicht versendet werden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`)
    ;(emailError as any).isEmailError = true
    ;(emailError as any).emailAddress = email
    throw emailError
  }

  // Always return the edit link so it can be shown in the UI as fallback
  return editLink
}

