/* ─── PayPal Webhook Handler (server-side) ───
 * Verifies incoming webhook signatures and processes events.
 * Reference: https://developer.paypal.com/docs/api/webhooks/v1/
 */

const API_BASE = 'https://api-m.sandbox.paypal.com'

/**
 * Verify a webhook signature with PayPal to ensure it's genuine.
 * POSTs the notification data + metadata to PayPal's verification endpoint.
 */
async function verifyWebhookSignature(clientId, clientSecret, webhookId, headers, bodyRaw) {
  // 1. Get OAuth token
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

  // 2. Build verification request
  const verificationBody = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: JSON.parse(bodyRaw),
  }

  // 3. Send to PayPal for verification
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
 * Handle a verified PayPal webhook event.
 * Returns { handled: boolean, message: string }
 */
export async function handleWebhookEvent(event) {
  const { event_type, resource } = event

  switch (event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      // Payment successfully captured
      const captureId = resource.id
      const customId = resource.custom_id || ''
      const amount = resource.amount?.value || '0'
      const status = resource.status

      console.log(`[PayPal Webhook] Payment captured: ${captureId}, amount: $${amount}, status: ${status}, user: ${customId}`)

      // Determine plan from the purchase unit reference
      const purchaseUnits = resource.supplementary_data?.related_ids?.order?.purchase_units
      let planId = 'plus' // default
      if (amount === '29.00') planId = 'business'

      return {
        handled: true,
        message: `Payment ${captureId} processed for plan: ${planId}`,
        planId,
        userId: customId,
      }
    }

    case 'PAYMENT.CAPTURE.DENIED': {
      console.warn(`[PayPal Webhook] Payment denied: ${resource.id}`)
      return { handled: true, message: 'Payment denied' }
    }

    case 'PAYMENT.CAPTURE.REFUNDED': {
      console.warn(`[PayPal Webhook] Payment refunded: ${resource.id}`)
      return { handled: true, message: 'Payment refunded' }
    }

    case 'CHECKOUT.ORDER.APPROVED': {
      // Order approved but not yet captured — informational
      console.log(`[PayPal Webhook] Order approved: ${resource.id}`)
      return { handled: true, message: 'Order approved' }
    }

    default:
      // Log unhandled event types but don't error
      console.log(`[PayPal Webhook] Unhandled event type: ${event_type}`)
      return { handled: false, message: `Unhandled event: ${event_type}` }
  }
}

/**
 * Express-style middleware for the PayPal webhook endpoint.
 */
export function createWebhookHandler(clientId, clientSecret, webhookId) {
  return async (req, res) => {
    // Only accept POST
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method not allowed')
      return
    }

    // Read raw body
    const buffers = []
    for await (const chunk of req) {
      buffers.push(chunk)
    }
    const bodyRaw = Buffer.concat(buffers).toString()

    // Parse headers (Express-like normalization)
    const headers = {
      'paypal-auth-algo': req.headers['paypal-auth-algo'],
      'paypal-cert-url': req.headers['paypal-cert-url'],
      'paypal-transmission-id': req.headers['paypal-transmission-id'],
      'paypal-transmission-sig': req.headers['paypal-transmission-sig'],
      'paypal-transmission-time': req.headers['paypal-transmission-time'],
    }

    // If webhook ID is configured, verify the signature
    if (webhookId) {
      const isValid = await verifyWebhookSignature(clientId, clientSecret, webhookId, headers, bodyRaw)
      if (!isValid) {
        console.warn('[PayPal Webhook] Invalid signature — rejecting')
        res.statusCode = 403
        res.end('Invalid signature')
        return
      }
    } else {
      console.warn('[PayPal Webhook] No WEBHOOK_ID configured — skipping verification')
    }

    // Parse and handle the event
    try {
      const event = JSON.parse(bodyRaw)
      const result = await handleWebhookEvent(event)

      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (err) {
      console.error('[PayPal Webhook] Error handling event:', err.message)
      res.statusCode = 500
      res.end(JSON.stringify({ error: err.message }))
    }
  }
}
