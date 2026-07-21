export interface EmailMessage { to: string; subject: string; html: string; text: string }
export interface EmailProvider { enabled(): boolean; send(message: EmailMessage): Promise<{ provider: string; messageId?: string }> }
