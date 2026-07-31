/**
 * POST /api/paypal/capture-order
 * Captures an approved PayPal order.
 * Body: { orderId: string }
 */
import { getPayPalToken } from './_shared.js'

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { orderId } = await request.json()
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing orderId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const token = await getPayPalToken(env)

    const API_BASE = env.PAYPAL_ENV === 'sandbox'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com'
    const res = await fetch(`${API_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return new Response(JSON.stringify({ error: `PayPal capture error (${res.status}): ${txt}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const capture = await res.json()
    return new Response(JSON.stringify(capture), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
