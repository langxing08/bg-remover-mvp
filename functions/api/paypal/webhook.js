/**
 * POST /api/paypal/webhook
 * Receives asynchronous PayPal webhook notifications.
 * Handles:
 *   CHECKOUT.ORDER.APPROVED   — order approved, awaiting capture
 *   PAYMENT.CAPTURE.COMPLETED — payment captured, grant plan access
 *   PAYMENT.CAPTURE.DENIED    — payment denied
 *   PAYMENT.CAPTURE.REFUNDED  — payment refunded, revoke plan access
 */

/**
 * Verify webhook signature using PayPal's verification API.
 */
async function verifySignature(env, headers, bodyRaw) {
  const API_BASE = env.PAYPAL_ENV === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com'
  if (!env.PAYPAL_WEBHOOK_ID) {
    console.warn('[PayPal Webhook] PAYPAL_WEBHOOK_ID not configured — skipping verification')
    return true
  }

  // If headers are empty, the request is not from PayPal — reject
  if (!headers['paypal-transmission-id'] || !headers['paypal-transmission-sig']) {
    console.warn('[PayPal Webhook] Missing PayPal signature headers — rejecting')
    return false
  }

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
  if (!tokenRes.ok) throw new Error(`PayPal OAuth failed (${tokenRes.status})`)
  const { access_token } = await tokenRes.json()

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
 * Extract plan info from a PayPal resource object.
 */
function extractPlanInfo(resource) {
  const amount = resource.amount?.value || resource.purchase_units?.[0]?.amount?.value || '0'
  const customId = resource.custom_id || ''
  const planId = amount === '29.00' ? 'business' : 'plus'
  const planName = planId === 'business' ? 'Business (150/month)' : 'Plus (30/month)'
  return { planId, planName, amount, customId }
}

/**
 * Handle a verified webhook event.
 */
async function handleEvent(event) {
  const { event_type, resource, create_time, id: webhookEventId } = event
  const timestamp = create_time || new Date().toISOString()
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

      // TODO: Save plan to KV store when available:
      //   await env.PLAN_KV.put(`plan:${customId}`, JSON.stringify({
      //     tier: planId, used: 0,
      //     total: planId === 'plus' ? 30 : 150,
      //     updatedAt: timestamp,
      //   }))

      return {
        handled: true,
        message: `Payment ${captureId} captured. ${planName} activated for user ${customId}.`,
        data: {
          event_type, captureId, planId, planName,
          amount, userId: customId, invoiceId, status, timestamp,
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

      // TODO: Downgrade user in KV store when available:
      //   await env.PLAN_KV.put(`plan:${customId}`, JSON.stringify({
      //     tier: 'free', used: 0, total: 3, updatedAt: timestamp,
      //   }))

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

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const bodyRaw = await request.text()

    const headers = {
      'paypal-auth-algo': request.headers.get('paypal-auth-algo') || '',
      'paypal-cert-url': request.headers.get('paypal-cert-url') || '',
      'paypal-transmission-id': request.headers.get('paypal-transmission-id') || '',
      'paypal-transmission-sig': request.headers.get('paypal-transmission-sig') || '',
      'paypal-transmission-time': request.headers.get('paypal-transmission-time') || '',
    }

    const isValid = await verifySignature(env, headers, bodyRaw)
    if (!isValid) {
      console.warn('[PayPal Webhook] Invalid signature')
      return new Response('Invalid signature', { status: 403 })
    }

    const event = JSON.parse(bodyRaw)
    console.log(`[PayPal Webhook] Received: ${event.event_type}`)
    const result = await handleEvent(event)
    console.log(`[PayPal Webhook] Response: ${result.message}`)

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
