/* ─── PayPal REST API helpers (server-side) ───
 * Uses PayPal Orders API v2 to create & capture orders.
 * Sandbox base: https://api-m.sandbox.paypal.com
 * Live base:    https://api-m.paypal.com
 */

const API_BASE = 'https://api-m.sandbox.paypal.com'

/**
 * Get an OAuth 2.0 access token from PayPal.
 */
async function getOAuthToken(clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`PayPal OAuth failed (${res.status}): ${txt}`)
  }

  const data = await res.json()
  return data.access_token
}

/**
 * Create a PayPal order for a one-time purchase.
 * @returns {object} PayPal order object (contains id, status, etc.)
 */
export async function createOrder(clientId, clientSecret, { planId, planName, price, userId, appUrl }) {
  const token = await getOAuthToken(clientId, clientSecret)

  const body = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: planId,
        description: planName,
        amount: {
          currency_code: 'USD',
          value: String(price),
        },
        custom_id: userId || 'anonymous',
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          landing_page: 'LOGIN',
          user_action: 'PAY_NOW',
          return_url: `${appUrl}/payment/success`,
          cancel_url: `${appUrl}/payment/cancel`,
        },
      },
    },
  }

  const res = await fetch(`${API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`PayPal createOrder failed (${res.status}): ${txt}`)
  }

  return res.json()
}

/**
 * Capture payment for an approved PayPal order.
 * @returns {object} PayPal capture response (contains status, purchase_units, etc.)
 */
export async function captureOrder(clientId, clientSecret, orderId) {
  const token = await getOAuthToken(clientId, clientSecret)

  const res = await fetch(`${API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`PayPal captureOrder failed (${res.status}): ${txt}`)
  }

  return res.json()
}
