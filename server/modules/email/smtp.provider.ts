import nodemailer from 'nodemailer'
import type { EmailMessage, EmailProvider } from './email.provider.js'
import type { SmtpSettings } from './email-configuration.service.js'

export class SmtpEmailProvider implements EmailProvider {
  constructor(private settings: SmtpSettings) {}
  enabled() { return Boolean(this.settings.host && this.settings.senderEmail) }
  async send(message: EmailMessage) {
    if (!this.enabled()) throw new Error('SMTP is not configured')
    const transport = nodemailer.createTransport({ host: this.settings.host, port: this.settings.port, secure: this.settings.secure, auth: this.settings.username ? { user: this.settings.username, pass: this.settings.password } : undefined, connectionTimeout: this.settings.timeoutMs })
    const result = await transport.sendMail({ from: { name: this.settings.senderName, address: this.settings.senderEmail }, replyTo: this.settings.replyTo, to: message.to, subject: message.subject, html: message.html, text: message.text })
    return { provider: 'smtp', messageId: result.messageId }
  }
}
