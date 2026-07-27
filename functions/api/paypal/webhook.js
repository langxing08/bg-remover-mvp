/**
 * POST /api/paypal/webhook
 * Receives asynchronous PayPal webhook notifications.
 * Verifies signature via PayPal's verify-webhook-signature API.
 */

const API_BASE = 'https://api-m.sandbox.paypal.com'

/**
 * Verify webhook signature using PayPal's verification API.
 */
async function verifySignature(env, headers, bodyRaw) {
  if (!env.PAYPAL_WEBHOOK_ID) {
    console.warn('[PayPal Webhook] PAYPAL_WEBHOOK_ID not configured — skipping verification')
    return true
  }

  // Get OAuth token
  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)
  const tokenRes = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials',
  })
  if (!tokenRes.ok) {
    throw new Error(`PayPal OAuth failed (${tokenRes.status})`)
  }
  const { access_token } = await tokenRes.json()

  // Build verification request
  const verificationBody = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: env.PAYPAL_WEBHOOK_ID,
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
    throw new Error(`Verification request failed (${verifyRes.status}): ${txt}`)
  }

  const result = await verifyRes.json()
  return result.verification_status === 'SUCCESS'
}

/**
 * Handle a verified webhook event.
 */
async function handleEvent(event) {
  const { event_type, resource } = event

  switch (event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      const captureId = resource.id
      const customId = resource.custom_id || ''
      const amount = resource.amount?.value || '0'

      console.log(`[Webhook] Payment captured: ${captureId}, $${amount}, user: ${customId}`)

      // Determine plan from amount
      const planId = amount === '29.00' ? 'business' : 'plus'

      return {
        handled: true,
        message: `Payment ${captureId} processed for ${planId}`,
      }
    }

    case 'PAYMENT.CAPTURE.DENIED':
      console.warn(`[Webhook] Payment denied: ${resource.id}`)
      return { handled: true, message: 'Payment denied' }

    case 'PAYMENT.CAPTURE.REFUNDED':
      console.warn(`[Webhook] Payment refunded: ${resource.id}`)
      return { handled: true, message: 'Payment refunded' }

    case 'CHECKOUT.ORDER.APPROVED':
      console.log(`[Webhook] Order approved: ${resource.id}`)
      return { handled: true, message: 'Order approved' }

    default:
      console.log(`[Webhook] Unhandled event: ${event_type}`)
      return { handled: false, message: `Unhandled: ${event_type}` }
  }
}

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const bodyRaw = await request.text()

    // Collect PayPal signature headers
    const headers = {
      'paypal-auth-algo': request.headers.get('paypal-auth-algo') || '',
      'paypal-cert-url': request.headers.get('paypal-cert-url') || '',
      'paypal-transmission-id': request.headers.get('paypal-transmission-id') || '',
      'paypal-transmission-sig': request.headers.get('paypal-transmission-sig') || '',
      'paypal-transmission-time': request.headers.get('paypal-transmission-time') || '',
    }

    // Verify webhook signature
    const isValid = await verifySignature(env, headers, bodyRaw)
    if (!isValid) {
      console.warn('[PayPal Webhook] Invalid signature')
      return new Response('Invalid signature', { status: 403 })
    }

    // Parse and handle event
    const event = JSON.parse(bodyRaw)
    const result = await handleEvent(event)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[PayPal Webhook] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
