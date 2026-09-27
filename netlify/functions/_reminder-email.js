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

const shell = ({ title, intro, booking, notice, momentLabel, momentTime }) => {
  const machine = escapeHtml(booking.machineName || `Machine ${booking.machineId}`)
  const date = escapeHtml(formatDate(booking.date))
  const firstName = escapeHtml(String(booking.studentName || 'there').trim().split(/\s+/)[0])
  const room = booking.roomNumber
    ? `<tr><td style="padding:13px 0;border-top:1px solid #323d5e;color:#a9b3ca;font-size:13px;">Room</td><td align="right" style="padding:13px 0;border-top:1px solid #323d5e;color:#f3f5ff;font-size:14px;font-weight:700;">${escapeHtml(booking.roomNumber)}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0c1129;color:#f3f5ff;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;color:#0c1129;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0c1129;"><tr><td align="center" style="padding:38px 14px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#171f3c;border:1px solid #303b5e;border-radius:20px;overflow:hidden;box-shadow:0 12px 36px rgba(22,32,66,.07);">
  <tr><td style="background:#1d2850;padding:30px 36px 34px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="width:46px;"><div style="width:38px;height:38px;line-height:38px;text-align:center;background:#716bf5;border-radius:10px;color:#ffffff;font-size:19px;font-weight:800;">H</div></td>
      <td style="color:#ffffff;font-size:13px;font-weight:800;letter-spacing:2px;">HOSTELONE<br><span style="color:#a9b4d5;font-size:10px;font-weight:700;letter-spacing:2.2px;">LAUNDRY</span></td>
      <td align="right" style="color:#bdbbff;font-size:11px;font-weight:800;letter-spacing:1.5px;">BOOKING REMINDER</td>
    </tr></table>
    <div style="height:1px;background:#384365;margin:28px 0 25px;font-size:0;">&nbsp;</div>
    <div style="color:#c4c1ff;font-size:11px;font-weight:800;letter-spacing:2px;">15 MINUTES TO GO</div>
    <h1 style="margin:11px 0 13px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;line-height:1.15;">${escapeHtml(title)}</h1>
    <p style="margin:0;color:#d1d7e9;font-size:15px;line-height:1.65;">Hi ${firstName}, ${escapeHtml(intro)}</p>
  </td></tr>
  <tr><td style="padding:31px 36px 0;">
    <div style="color:#a9b3d1;font-size:11px;font-weight:800;letter-spacing:2px;">YOUR BOOKING</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:13px;background:#222b4d;border:1px solid #374265;border-radius:14px;">
      <tr><td style="padding:19px 22px;">
        <div style="color:#a9b3d1;font-size:11px;font-weight:800;letter-spacing:1.5px;">${escapeHtml(momentLabel)}</div>
        <div style="padding-top:5px;color:#ffffff;font-size:34px;font-weight:800;letter-spacing:-1px;line-height:1.1;">${escapeHtml(momentTime)} <span style="color:#b6b2ff;font-size:12px;font-weight:700;letter-spacing:0;">MINSK TIME</span></div>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:11px;">
      <tr><td style="padding:13px 0;color:#a9b3ca;font-size:13px;">Date</td><td align="right" style="padding:13px 0;color:#f3f5ff;font-size:14px;font-weight:700;">${date}</td></tr>
      <tr><td style="padding:13px 0;border-top:1px solid #323d5e;color:#a9b3ca;font-size:13px;">Slot</td><td align="right" style="padding:13px 0;border-top:1px solid #323d5e;color:#f3f5ff;font-size:14px;font-weight:700;">${escapeHtml(`${booking.startTime}–${booking.endTime}`)}</td></tr>
      <tr><td style="padding:13px 0;border-top:1px solid #323d5e;color:#a9b3ca;font-size:13px;">Washer</td><td align="right" style="padding:13px 0;border-top:1px solid #323d5e;color:#f3f5ff;font-size:14px;font-weight:700;">${machine}</td></tr>
      ${room}
    </table>
  </td></tr>
  <tr><td style="padding:18px 36px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#272752;border-left:3px solid #716bf5;border-radius:7px;"><tr><td style="padding:15px 17px;color:#d7d6ff;font-size:13px;line-height:1.65;">${escapeHtml(notice)}</td></tr></table></td></tr>
  <tr><td style="padding:28px 36px 34px;"><a href="${SITE_URL}" style="display:inline-block;padding:14px 21px;background:#6963eb;border-radius:9px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:800;">View my booking &nbsp;→</a></td></tr>
  <tr><td style="border-top:1px solid #303b5e;padding:23px 36px 27px;color:#a8b3cc;font-size:12px;line-height:1.6;">Sent because you enabled email reminders in your Hostelone dashboard. <a href="${SITE_URL}" style="color:#bebaff;text-decoration:underline;">Manage reminders</a><br><br><span style="color:#e8eaff;font-weight:700;">Hostelone · Laundry bookings</span></td></tr>
</table>
<div style="max-width:580px;padding:17px 12px 0;color:#8f9ab3;font-size:11px;line-height:1.5;text-align:center;">Hostelone resident booking service</div>
</td></tr></table></body></html>`
}

export const buildReminderEmail = (kind, booking) => {
  const isStart = kind === 'start'
  if (!isStart && kind !== 'collect') throw new Error('Unknown reminder type')
  const title = isStart ? 'Your wash starts soon' : 'Your wash ends soon'
  const subject = isStart ? 'Your wash starts in 15 minutes' : 'Your slot ends in 15 minutes'
  const intro = isStart
    ? 'your laundry slot begins in 15 minutes. Bring your clothes and detergent, and arrive on time.'
    : 'your laundry slot ends in 15 minutes. Please return to the laundry room and collect your clothes.'
  const notice = isStart
    ? 'Plans changed? Open your dashboard to review your booking before the slot begins.'
    : 'Please leave the machine ready for the next resident when your slot ends. Thank you.'
  return {
    subject: `Hostelone · ${subject}`,
    htmlContent: shell({
      title, intro, booking, notice,
      momentLabel: isStart ? 'STARTS AT' : 'ENDS AT',
      momentTime: isStart ? booking.startTime : booking.endTime,
    }),
    textContent: `Hostelone laundry reminder\n\nHi ${String(booking.studentName || 'there').trim().split(/\s+/)[0]}, ${intro}\n\n${formatDate(booking.date)} · ${booking.startTime}–${booking.endTime} Minsk time · ${booking.machineName || `Machine ${booking.machineId}`}\n\n${notice}\n\nManage reminders: ${SITE_URL}`,
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
