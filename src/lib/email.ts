import { supabase } from './supabase'

export const sendEditLinkEmail = async (
  email: string,
  token: string,
  _registrationId: string
): Promise<string> => {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const editLink = `${baseUrl}/edit/${token}`

  // HTML content for the email that the Supabase Edge Function will send via Resend
  const html = `
    <h1>Anmeldung SCL Hallenmehrkampf</h1>
    <p>Vielen Dank für Ihre Anmeldung.</p>
    <p>Über den folgenden Link können Sie Ihre Anmeldung jederzeit bearbeiten:</p>
    <p>
      <a href="${editLink}">${editLink}</a>
    </p>
    <p>Falls der Link nicht klickbar ist, kopieren Sie ihn bitte in die Adresszeile Ihres Browsers.</p>
  `

  try {
    if (supabase) {
      const { error } = await supabase.functions.invoke('resend-email', {
        body: {
          to: email,
          subject: 'Ihre Anmeldung zum SCL Hallenmehrkampf - Bearbeitungslink',
          html
        },
      })

      if (error) {
        console.error('Error invoking resend-email function:', error)
      }
    } else {
      console.warn('Supabase client not configured, skipping email send')
    }
  } catch (error) {
    console.error('Error sending email via resend-email function:', error)
  }

  // Always return the edit link so it can be shown in the UI as fallback
  return editLink
}

