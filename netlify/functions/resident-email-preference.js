import { jsonResponse } from './_resident-firestore.js'
import {
  clearPendingReminderVerification,
  getReminderPreferenceStatus,
  normalizeReminderEmail,
  removeReminderPreference,
  requestReminderVerification,
  verifyResidentIdentity,
} from './_reminder-preferences.js'
import { sendBrevoEmail } from './_reminder-email.js'

const SITE_URL = process.env.DEPLOY_PRIME_URL || process.env.URL || 'https://hostelone.netlify.app'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })
  try {
    const payload = JSON.parse(event.body ?? '{}')
    const student = await verifyResidentIdentity(payload)
    if (!student) return jsonResponse(403, { error: 'Please sign in again to manage reminders.' })

    if (payload.action === 'status') {
      return jsonResponse(200, await getReminderPreferenceStatus(student.id), { 'Cache-Control': 'no-store' })
    }
    if (payload.action === 'remove') {
      await removeReminderPreference(student.id)
      return jsonResponse(200, { enabled: false, email: '', pendingEmail: '' }, { 'Cache-Control': 'no-store' })
    }
    if (payload.action !== 'subscribe') return jsonResponse(400, { error: 'Invalid action' })

    const email = normalizeReminderEmail(payload.email)
    if (!email) return jsonResponse(400, { error: 'Enter a valid email address.' })
    const request = await requestReminderVerification({ studentId: student.id, email })
    if (request.cooldown) return jsonResponse(429, { error: 'Please wait one minute before requesting another verification email.' })

    const verifyUrl = new URL('/.netlify/functions/resident-email-verify', SITE_URL)
    verifyUrl.searchParams.set('token', request.token)
    try {
      await sendBrevoEmail({
        to: email,
        subject: 'Confirm your Hostelone laundry reminders',
        htmlContent: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0d1430;font-family:Arial,Helvetica,sans-serif;color:#eef2ff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px;"><table role="presentation" width="100%" style="max-width:520px;border:1px solid #30395b;border-radius:18px;background:#151d3b;"><tr><td style="padding:32px;"><div style="font-size:13px;letter-spacing:2px;color:#aaa8ff;font-weight:800;">HOSTELONE / LAUNDRY</div><h1 style="font-size:27px;line-height:1.2;color:#fff;margin:28px 0 12px;">Confirm your email</h1><p style="font-size:15px;line-height:1.6;color:#c5cce0;">You requested reminders for your laundry bookings. Confirm this address to receive an email 15 minutes before your slot starts and another 15 minutes before it ends.</p><a href="${verifyUrl.toString()}" style="display:inline-block;background:#6864f7;color:#fff;text-decoration:none;border-radius:11px;padding:14px 20px;font-size:14px;font-weight:700;margin:14px 0;">Confirm email address &rarr;</a><p style="font-size:12px;line-height:1.6;color:#8c99b5;">This link expires in 24 hours. If you didn’t request reminders, you can ignore this message.</p></td></tr></table></td></tr></table></body></html>`,
        textContent: `Confirm your Hostelone laundry reminders: ${verifyUrl.toString()}\n\nThis link expires in 24 hours. If you did not request this, ignore this email.`,
        tags: ['reminder-verification'],
      })
    } catch (error) {
      await clearPendingReminderVerification(student.id)
      throw error
    }
    return jsonResponse(200, await getReminderPreferenceStatus(student.id), { 'Cache-Control': 'no-store' })
  } catch (error) {
    console.error('resident-email-preference failed', error)
    return jsonResponse(500, { error: 'Reminders are unavailable right now. Please try again later.' })
  }
}
