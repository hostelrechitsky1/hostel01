import { confirmReminderVerification } from './_reminder-preferences.js'

const page = (verified) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${verified ? 'Email confirmed' : 'Confirmation link expired'} · Hostelone</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#0d1430,#1b1942);color:#f5f6ff;font-family:Arial,Helvetica,sans-serif;"><main style="max-width:430px;margin:20px;padding:35px;border:1px solid #38416c;border-radius:20px;background:#1b2343;text-align:center;box-shadow:0 20px 70px #090d2466;"><div style="font-size:12px;letter-spacing:2px;color:#aaa8ff;font-weight:800;">HOSTELONE / LAUNDRY</div><h1 style="font-size:28px;margin:26px 0 12px;">${verified ? 'Email confirmed' : 'Link expired or invalid'}</h1><p style="color:#c4cbe1;line-height:1.6;">${verified ? 'Your booking reminders are now on. We’ll email you before your booked slot starts and before it ends.' : 'Please return to your dashboard and request a new confirmation email.'}</p><a href="/" style="display:inline-block;margin-top:16px;padding:13px 20px;border-radius:10px;background:#6864f7;color:white;text-decoration:none;font-weight:700;">Return to dashboard</a></main></body></html>`

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method not allowed' }
  let verified = false
  try {
    verified = await confirmReminderVerification(event.queryStringParameters?.token)
  } catch (error) {
    console.error('resident-email-verify failed', error)
  }
  return {
    statusCode: verified ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    body: page(verified),
  }
}
