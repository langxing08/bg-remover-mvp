/**
 * GET /api/paypal/config
 * Returns the PayPal Client ID for frontend SDK initialization.
 */
export async function onRequest(context) {
  const { env } = context

  return new Response(JSON.stringify({ clientId: env.PAYPAL_CLIENT_ID || '' }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
