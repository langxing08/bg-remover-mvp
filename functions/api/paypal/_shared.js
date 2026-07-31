/**
 * Shared PayPal helpers for Cloudflare Pages Functions.
 * Uses Sandbox API — switch to production for live.
 */

/**
 * Get a PayPal OAuth 2.0 access token using Client ID + Secret from env.
 */
export async function getPayPalToken(env) {
  const API_BASE = env.PAYPAL_ENV === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com'
  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)

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
