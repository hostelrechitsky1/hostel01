import { describe, expect, it } from 'vitest'
import { buildReminderEmail } from '../_reminder-email.js'

const booking = {
  date: '2026-09-28', startTime: '16:30', endTime: '18:00',
  studentName: 'Ayon Silva', roomNumber: '52-2', machineId: '2', machineName: 'Machine 2',
}

describe('reminder emails', () => {
  it('shows the booked time and distinct guidance for each reminder', () => {
    const start = buildReminderEmail('start', booking)
    const collect = buildReminderEmail('collect', booking)
    expect(start.subject).toContain('starts in 15 minutes')
    expect(start.htmlContent).toContain('16:30–18:00')
    expect(start.htmlContent).toContain('Machine 2')
    expect(collect.subject).toContain('ends in 15 minutes')
    expect(collect.htmlContent).toContain('collect your clothes')
    expect(collect.textContent).toContain('Manage reminders')
  })

  it('escapes student and machine names in HTML', () => {
    const email = buildReminderEmail('start', { ...booking, studentName: '<img src=x>', machineName: '<script>bad</script>' })
    expect(email.htmlContent).not.toContain('<script>')
    expect(email.htmlContent).toContain('&lt;script&gt;')
    expect(email.htmlContent).toContain('&lt;img')
  })

  it('keeps the email surface dark in clients that support color schemes', () => {
    const { htmlContent } = buildReminderEmail('start', booking)
    expect(htmlContent).toContain('name="color-scheme" content="light dark"')
    expect(htmlContent).toContain('@media (prefers-color-scheme: dark)')
    expect(htmlContent).toContain('bgcolor="#101521"')
    expect(htmlContent).toContain('bgcolor="#1b2232"')
  })
})
