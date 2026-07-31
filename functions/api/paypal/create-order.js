/**
 * POST /api/paypal/create-order
 * Creates a PayPal order for a one-time plan purchase.
 * Body: { planId: 'plus'|'business', price: 9|29 }
 */
import { getPayPalToken } from './_shared.js'

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { planId, price } = await request.json()

    const planNames = {
      plus: 'Plus Plan — 30 removals/month',
      business: 'Business Plan — 150 removals/month',
    }
    const planName = planNames[planId] || 'Plan'
    const appUrl = env.APP_URL || 'https://bg-remover-mvp.pages.dev'

    // Extract user ID from session cookie
    const cookieHeader = request.headers.get('Cookie') || ''
    let userId = 'anonymous'
    try {
      const cookies = Object.fromEntries(
        cookieHeader.split(';').filter(Boolean).map(c => {
          const [k, ...v] = c.trim().split('=')
          return [k, v.join('=')]
        })
      )
      const token = cookies.session
      if (token) {
        const [encodedData] = token.split('.')
        const user = JSON.parse(atob(encodedData))
        userId = user.sub || user.email || 'anonymous'
      }
    } catch { /* ignore */ }

    const token = await getPayPalToken(env)

    const orderBody = {
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: planId,
        description: planName,
        amount: { currency_code: 'USD', value: String(price) },
        custom_id: userId,
      }],
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

    const API_BASE = env.PAYPAL_ENV === 'sandbox'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com'
    const res = await fetch(`${API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderBody),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return new Response(JSON.stringify({ error: `PayPal error (${res.status}): ${txt}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const order = await res.json()
    return new Response(JSON.stringify({ id: order.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
