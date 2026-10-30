// Spiegelt Abmeldungen, Bounces und Spam-Meldungen von Resend in die Empfängerliste.
// Deploy: supabase functions deploy resend-webhook --no-verify-jwt
// Benötigt RESEND_WEBHOOK_SECRET; die Echtheit wird über die Svix-Signatur geprüft.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Webhook } from 'npm:svix@1'

const RESEND_WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET')!

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type ResendEvent = {
  type: string
  data: { email?: string; to?: string[]; unsubscribed?: boolean }
}

// needs_sync bleibt unberührt: Resend kennt diesen Stand bereits
const setStatus = async (emails: string[], status: string) => {
  const update: Record<string, unknown> = { status }
  if (status === 'unsubscribed') update.unsubscribed_at = new Date().toISOString()

  const { error } = await admin
    .from('newsletter_contacts')
    .update(update)
    .in('email', emails.map((email) => email.trim().toLowerCase()))
    .neq('status', 'complained')
  if (error) throw error
}

Deno.serve(async (req) => {
  const rawBody = await req.text()

  let event: ResendEvent
  try {
    event = new Webhook(RESEND_WEBHOOK_SECRET).verify(rawBody, {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }) as ResendEvent
  } catch (error) {
    console.error('Invalid webhook signature', error)
    return new Response('Invalid signature', { status: 401 })
  }

  try {
    const { type, data } = event
    const emails = data.to ?? (data.email ? [data.email] : [])

    if (type === 'contact.updated' && data.unsubscribed === true) {
      await setStatus(emails, 'unsubscribed')
    } else if (type === 'email.bounced' || type === 'suppression.added') {
      await setStatus(emails, 'bounced')
    } else if (type === 'email.complained') {
      await setStatus(emails, 'complained')
    }
  } catch (error) {
    // 500 sorgt dafür, dass Resend das Ereignis erneut zustellt
    console.error('Failed to process webhook', error)
    return new Response('Processing failed', { status: 500 })
  }

  return new Response('ok')
})
