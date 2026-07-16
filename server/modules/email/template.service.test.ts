import { describe, expect, it } from 'vitest'
import { TemplateService } from './template.service.js'

const valid = { subject: 'Reset for {{displayName}}', htmlBody: '<p><a href="{{resetUrl}}">Reset</a></p>', textBody: 'Open {{resetUrl}} in {{expiresMinutes}} minutes.' }

describe('email template service', () => {
  it('renders allowed tags and escapes HTML values', async () => {
    const preview = await new TemplateService().preview({ ...valid, htmlBody: '<p>{{displayName}} <a href="{{resetUrl}}">Reset</a></p>' })
    expect(preview.html).toContain('NorthStar User')
    expect(preview.html).toContain('preview-token')
  })
  it('rejects unknown tags and unsafe HTML', async () => {
    await expect(new TemplateService().preview({ ...valid, textBody: '{{unknown}} {{resetUrl}}' })).rejects.toMatchObject({ code: 'EMAIL_TEMPLATE_UNKNOWN_TAG' })
    await expect(new TemplateService().preview({ ...valid, htmlBody: '<script>alert(1)</script><a href="{{resetUrl}}">Reset</a>' })).rejects.toMatchObject({ code: 'EMAIL_TEMPLATE_UNSAFE_HTML' })
  })
  it('requires the reset URL tag', async () => {
    await expect(new TemplateService().preview({ subject: 'Reset', htmlBody: '<p>Reset</p>', textBody: 'Reset' })).rejects.toMatchObject({ code: 'EMAIL_TEMPLATE_REQUIRED_TAG' })
  })
})
