import { supabase } from './supabase'

type EmailError = Error & { isEmailError: true; emailAddress: string }

const emailError = (message: string, email: string): EmailError =>
  Object.assign(new Error(message), { isEmailError: true as const, emailAddress: email })

/**
 * Sends the edit-link e-mail for a registration.
 * The edge function builds the e-mail itself and only sends it to the address stored in the
 * registration, so the content cannot be abused from the browser.
 */
export const sendEditLinkEmail = async (email: string, token: string): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('resend-email', {
      body: {
        type: 'edit-link',
        edit_token: token,
        base_url: window.location.origin,
      },
    })

    if (error) {
      console.error('Error invoking resend-email function:', error)
      throw emailError(`E-Mail konnte nicht versendet werden: ${error.message || 'Ungültige E-Mail-Adresse'}`, email)
    }
  } catch (error) {
    console.error('Error sending email via resend-email function:', error)
    if (error instanceof Error && (error as Partial<EmailError>).isEmailError) {
      throw error
    }
    throw emailError(
      `E-Mail konnte nicht versendet werden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      email
    )
  }
}
