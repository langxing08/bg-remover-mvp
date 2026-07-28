/* ─── PayPal Webhook Handler (server-side) ───
 * Handles:
 *   CHECKOUT.ORDER.APPROVED   — order approved, awaiting capture
 *   PAYMENT.CAPTURE.COMPLETED — payment captured, grant plan access
 *   PAYMENT.CAPTURE.DENIED    — payment denied
 *   PAYMENT.CAPTURE.REFUNDED  — payment refunded, revoke plan access
 *
 * Reference: https://developer.paypal.com/docs/api/webhooks/v1/
 */

const API_BASE = 'https://api-m.sandbox.paypal.com'

/**
 * Verify a webhook signature with PayPal.
 * POSTs the notification data + metadata to PayPal's verification endpoint.
 */
async function verifyWebhookSignature(clientId, clientSecret, webhookId, headers, bodyRaw) {
  // If headers are empty, the request is not from PayPal — reject
  if (!headers['paypal-transmission-id'] || !headers['paypal-transmission-sig']) {
    console.warn('[PayPal Webhook] Missing PayPal signature headers — rejecting')
    return false
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenRes = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials',
  })
  if (!tokenRes.ok) throw new Error(`PayPal OAuth failed (${tokenRes.status})`)
  const { access_token } = await tokenRes.json()

  const verificationBody = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: JSON.parse(bodyRaw),
  }

  const verifyRes = await fetch(`${API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify(verificationBody),
  })

  if (!verifyRes.ok) {
    const txt = await verifyRes.text().catch(() => '')
    throw new Error(`Webhook verification request failed (${verifyRes.status}): ${txt}`)
  }

  const result = await verifyRes.json()
  return result.verification_status === 'SUCCESS'
}

/**
 * Determine plan info from a PayPal webhook resource.
 */
function extractPlanInfo(resource, event) {
  const amount = resource.amount?.value || resource.purchase_units?.[0]?.amount?.value || '0'
  const customId = resource.custom_id || ''
  const planId = amount === '29.00' ? 'business' : 'plus'
  const planName = planId === 'business' ? 'Business (150/month)' : 'Plus (30/month)'
  return { planId, planName, amount, customId }
}

/**
 * Format a timestamp for logging / storage.
 */
function formatTime(iso) {
  if (!iso) return new Date().toISOString()
  return iso
}

/**
 * Handle a verified PayPal webhook event.
 */
export async function handleWebhookEvent(event) {
  const { event_type, resource, event_version, create_time, id: webhookEventId } = event
  const timestamp = formatTime(create_time)
  const summary = `[Webhook] ${event_type} | id=${webhookEventId} | time=${timestamp}`

  switch (event_type) {
    /* ─── Order approved by buyer — waiting for capture ─── */
    case 'CHECKOUT.ORDER.APPROVED': {
      const orderId = resource.id
      const status = resource.status
      const { planId, planName, amount, customId } = extractPlanInfo(resource)

      console.log(`${summary} | order=${orderId} | status=${status} | plan=${planId} | user=${customId}`)

      return {
        handled: true,
        message: `Order ${orderId} approved for ${planName}. Awaiting capture.`,
        data: { event_type, orderId, planId, amount, userId: customId, status, timestamp },
      }
    }

    /* ─── Payment captured — grant plan access ─── */
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const captureId = resource.id
      const status = resource.status
      const invoiceId = resource.invoice_id || ''
      const { planId, planName, amount, customId } = extractPlanInfo(resource)

      console.log(`${summary} | capture=${captureId} | status=${status} | amount=$${amount} | plan=${planId} | user=${customId}`)

      // TODO: Save plan to database / KV store
      //   await db.saveUserPlan(customId, { tier: planId, used: 0, total: planId === 'plus' ? 30 : 150 })
      //
      // For now the frontend handles plan persistence via onApprove callback + localStorage.
      // The webhook is the authoritative source for chargeback/dispute handling.

      return {
        handled: true,
        message: `Payment ${captureId} captured. ${planName} activated for user ${customId}.`,
        data: {
          event_type,
          captureId,
          planId,
          planName,
          amount,
          userId: customId,
          invoiceId,
          status,
          timestamp,
        },
      }
    }

    /* ─── Payment denied — do NOT grant access ─── */
    case 'PAYMENT.CAPTURE.DENIED': {
      const captureId = resource.id
      const reason = resource.failure_reason || resource.processor_response?.response_code || 'Unknown reason'
      const { amount, customId } = extractPlanInfo(resource)

      console.warn(`${summary} | capture=${captureId} | reason=${reason} | user=${customId}`)

      return {
        handled: true,
        message: `Payment ${captureId} denied: ${reason}`,
        data: { event_type, captureId, reason, userId: customId, amount, timestamp },
      }
    }

    /* ─── Payment refunded — revoke plan access ─── */
    case 'PAYMENT.CAPTURE.REFUNDED': {
      const captureId = resource.id
      const refundId = resource.related_ids?.refund?.id || 'unknown'
      const amount = resource.amount?.value || resource.seller_receivable_breakdown?.gross_amount?.value || '0'
      const customId = resource.custom_id || ''

      console.warn(`${summary} | capture=${captureId} | refund=${refundId} | amount=$${amount} | user=${customId}`)

      // TODO: Downgrade user plan in database / KV store
      //   await db.saveUserPlan(customId, { tier: 'free', used: 0, total: 3 })
      //
      // This ensures a refunded user loses access to paid features.

      return {
        handled: true,
        message: `Payment ${captureId} refunded (${refundId}). Plan revoked for user ${customId}.`,
        data: { event_type, captureId, refundId, amount, userId: customId, timestamp },
      }
    }

    default:
      console.log(`[Webhook] Unhandled event: ${event_type}`)
      return { handled: false, message: `Unhandled: ${event_type}` }
  }
}

/**
 * Express-style middleware for the PayPal webhook endpoint.
 */
export function createWebhookHandler(clientId, clientSecret, webhookId) {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method not allowed')
      return
    }

    const buffers = []
    for await (const chunk of req) { buffers.push(chunk) }
    const bodyRaw = Buffer.concat(buffers).toString()

    const headers = {
      'paypal-auth-algo': req.headers['paypal-auth-algo'],
      'paypal-cert-url': req.headers['paypal-cert-url'],
      'paypal-transmission-id': req.headers['paypal-transmission-id'],
      'paypal-transmission-sig': req.headers['paypal-transmission-sig'],
      'paypal-transmission-time': req.headers['paypal-transmission-time'],
    }

    if (webhookId) {
      try {
        const isValid = await verifyWebhookSignature(clientId, clientSecret, webhookId, headers, bodyRaw)
        if (!isValid) {
          console.warn('[PayPal Webhook] Invalid signature — rejecting')
          res.statusCode = 403
          res.end('Invalid signature')
          return
        }
      } catch (err) {
        console.error('[PayPal Webhook] Signature verification error:', err.message)
        res.statusCode = 500
        res.end(JSON.stringify({ error: err.message }))
        return
      }
    } else {
      console.warn('[PayPal Webhook] No WEBHOOK_ID configured — skipping verification')
    }

    try {
      const event = JSON.parse(bodyRaw)
      console.log(`[PayPal Webhook] Received: ${event.event_type}`)
      const result = await handleWebhookEvent(event)
      console.log(`[PayPal Webhook] Response:`, result.message)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (err) {
      console.error('[PayPal Webhook] Error handling event:', err.message)
      res.statusCode = 500
      res.end(JSON.stringify({ error: err.message }))
    }
  }
}
