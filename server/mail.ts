/*
 * Outgoing email (OTP codes, registration notices).
 * With SMTP_HOST set, mail goes out through SMTP. Without it (development), messages are printed to
 * the server console and kept in `outbox` so tests can read the codes.
 */
import type { ServerConfig } from './config'

export interface Mail {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
  /** last messages, only filled when no SMTP server is configured */
  outbox: Mail[]
}

export function createMailer(cfg: ServerConfig): Mailer {
  const outbox: Mail[] = []

  if (!cfg.smtp) {
    if (cfg.production) console.warn('[mail] SMTP_HOST is not set — emails (OTP codes) are only written to this console.')
    return {
      outbox,
      async send(mail) {
        outbox.push(mail)
        if (outbox.length > 50) outbox.shift()
        console.log(`\n[mail] (not sent — no SMTP configured)\n  To: ${mail.to}\n  Subject: ${mail.subject}\n  ${mail.text.replace(/\n/g, '\n  ')}\n`)
      },
    }
  }

  const smtp = cfg.smtp
  let transport: Promise<{ sendMail(o: object): Promise<unknown> }> | null = null
  const getTransport = () =>
    (transport ??= import('nodemailer').then((m) =>
      m.default.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      }),
    ))

  return {
    outbox,
    async send(mail) {
      try {
        await (await getTransport()).sendMail({ from: cfg.mailFrom, to: mail.to, subject: mail.subject, text: mail.text })
      } catch (e) {
        console.error(`[mail] could not send "${mail.subject}" to ${mail.to}:`, (e as Error).message)
        throw new Error('We could not send the email right now. Please try again in a few minutes.')
      }
    },
  }
}
