const SENDER_EMAIL = 'hostel.rechitsky1@gmail.com'
const SITE_URL = 'https://hostelone.netlify.app/'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

const formatDate = (date) => {
  const parsed = new Date(`${date}T12:00:00+03:00`)
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Minsk', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(parsed)
}

const shell = ({ title, intro, booking, action, momentLabel, momentTime }) => {
  const machine = escapeHtml(booking.machineName || `Machine ${booking.machineId}`)
  const date = escapeHtml(formatDate(booking.date))
  const firstName = escapeHtml(String(booking.studentName || 'there').trim().split(/\s+/)[0])
  const room = booking.roomNumber
    ? `<tr><td class="muted" style="padding:14px 0;border-top:1px solid #343c52;color:#adb6cb;font-size:13px;">Room</td><td class="strong" align="right" style="padding:14px 0;border-top:1px solid #343c52;color:#f1f3f9;font-size:14px;font-weight:600;">${escapeHtml(booking.roomNumber)}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media only screen and (max-width: 600px) { .email-pad { padding-left:24px !important;padding-right:24px !important; } .email-title { font-size:27px !important; } .email-time { font-size:43px !important; } }
@media (prefers-color-scheme: dark) { .canvas { background-color:#101521 !important; } .panel { background-color:#1b2232 !important; } .heading,.strong { color:#f1f3f9 !important; } .body-copy { color:#d4d9e5 !important; } .muted { color:#adb6cb !important; } .divider { border-color:#343c52 !important; } .time { color:#c4bfff !important; } .button { background-color:#7771e8 !important;color:#ffffff !important; } }
[data-ogsc] .canvas { background-color:#101521 !important; } [data-ogsc] .panel { background-color:#1b2232 !important; } [data-ogsc] .heading,[data-ogsc] .strong { color:#f1f3f9 !important; } [data-ogsc] .body-copy { color:#d4d9e5 !important; } [data-ogsc] .muted { color:#adb6cb !important; }
</style></head>
<body class="canvas" bgcolor="#101521" style="margin:0;padding:0;background-color:#101521;color:#f1f3f9;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;color:#101521;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(intro)}</div>
<table class="canvas" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#101521" style="background-color:#101521;"><tr><td align="center" style="padding:32px 14px;">
<table class="panel" role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#1b2232" style="width:100%;max-width:560px;background-color:#1b2232;border:1px solid #343c52;border-radius:12px;">
  <tr><td class="email-pad" style="padding:31px 38px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td class="heading" style="color:#f1f3f9;font-size:18px;font-weight:700;letter-spacing:-.3px;">Hostelone<span style="color:#8983f3;">.</span></td><td class="muted" align="right" style="color:#adb6cb;font-size:12px;">Laundry reminders</td></tr></table>
  </td></tr>
  <tr><td class="email-pad" style="padding:39px 38px 0;">
    <p class="muted" style="margin:0 0 12px;color:#adb6cb;font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;">${escapeHtml(momentLabel)}</p>
    <h1 class="heading email-title" style="margin:0;color:#f1f3f9;font-size:30px;font-weight:700;line-height:1.24;letter-spacing:-.7px;">${escapeHtml(title)}</h1>
    <p class="body-copy" style="margin:17px 0 0;color:#d4d9e5;font-size:15px;line-height:1.65;">Hi ${firstName}, ${escapeHtml(intro)}</p>
  </td></tr>
  <tr><td class="email-pad" style="padding:31px 38px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr><td class="divider" style="padding:24px 0 21px;border-top:1px solid #343c52;border-bottom:1px solid #343c52;">
        <span class="time email-time" style="color:#c4bfff;font-size:48px;font-weight:700;letter-spacing:-2px;line-height:1;">${escapeHtml(momentTime)}</span><span class="muted" style="padding-left:11px;color:#adb6cb;font-size:12px;white-space:nowrap;">Minsk time</span>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;">
      <tr><td class="muted" style="padding:14px 0;color:#adb6cb;font-size:13px;">Date</td><td class="strong" align="right" style="padding:14px 0;color:#f1f3f9;font-size:14px;font-weight:600;">${date}</td></tr>
      <tr><td class="muted" style="padding:14px 0;border-top:1px solid #343c52;color:#adb6cb;font-size:13px;">Booking</td><td class="strong" align="right" style="padding:14px 0;border-top:1px solid #343c52;color:#f1f3f9;font-size:14px;font-weight:600;">${escapeHtml(`${booking.startTime}–${booking.endTime}`)}</td></tr>
      <tr><td class="muted" style="padding:14px 0;border-top:1px solid #343c52;color:#adb6cb;font-size:13px;">Machine</td><td class="strong" align="right" style="padding:14px 0;border-top:1px solid #343c52;color:#f1f3f9;font-size:14px;font-weight:600;">${machine}</td></tr>
      ${room}
    </table>
  </td></tr>
  <tr><td class="email-pad" style="padding:18px 38px 35px;">
    <p class="body-copy" style="margin:0 0 24px;color:#d4d9e5;font-size:14px;line-height:1.6;">${escapeHtml(action)}</p>
    <table role="presentation" cellspacing="0" cellpadding="0"><tr><td class="button" bgcolor="#7771e8" style="background-color:#7771e8;border-radius:7px;"><a href="${SITE_URL}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">View booking</a></td></tr></table>
  </td></tr>
  <tr><td class="divider email-pad" style="padding:23px 38px 29px;border-top:1px solid #343c52;">
    <p class="muted" style="margin:0;color:#adb6cb;font-size:12px;line-height:1.6;">You received this because email reminders are on for your account. <a href="${SITE_URL}" style="color:#c4bfff;text-decoration:underline;">Manage reminders</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`
}

export const buildReminderEmail = (kind, booking) => {
  const isStart = kind === 'start'
  if (!isStart && kind !== 'collect') throw new Error('Unknown reminder type')
  const title = isStart ? 'Your booking starts soon' : 'Time to collect your clothes'
  const subject = isStart ? 'Your wash starts in 15 minutes' : 'Your slot ends in 15 minutes'
  const intro = isStart
    ? 'your laundry slot begins in 15 minutes. Bring your clothes and detergent, and arrive on time.'
    : 'your laundry slot ends in 15 minutes. Please return to the laundry room and collect your clothes.'
  const action = isStart
    ? 'Please bring your clothes and detergent to the laundry room on time.'
    : 'Please empty the machine by the end of your slot so it is ready for the next resident.'
  return {
    subject: `Hostelone · ${subject}`,
    htmlContent: shell({
      title, intro, booking, action,
      momentLabel: isStart ? 'Your booking starts at' : 'Your booking ends at',
      momentTime: isStart ? booking.startTime : booking.endTime,
    }),
    textContent: `Hostelone laundry reminder\n\nHi ${String(booking.studentName || 'there').trim().split(/\s+/)[0]}, ${intro}\n\n${formatDate(booking.date)} · ${booking.startTime}–${booking.endTime} Minsk time · ${booking.machineName || `Machine ${booking.machineId}`}\n\n${action}\n\nManage reminders: ${SITE_URL}`,
  }
}

export const sendBrevoEmail = async ({ to, subject, htmlContent, textContent, tags = [] }) => {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error('Brevo API key is not configured')
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({
      sender: { name: 'Hostelone', email: SENDER_EMAIL },
      replyTo: { name: 'Hostelone', email: SENDER_EMAIL },
      to: [{ email: to }], subject, htmlContent, textContent, tags,
    }),
  })
  if (!response.ok) throw new Error(`Brevo delivery request failed with ${response.status}`)
  return response.json()
}

export const reminderSenderEmail = SENDER_EMAIL
