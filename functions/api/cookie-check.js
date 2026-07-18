/**
 * Debug endpoint — check if cookies are being sent
 * Returns: { cookies_present: bool, keys: [...] }
 */
export async function onRequest({ request }) {
  const cookieHeader = request.headers.get('Cookie') || ''
  const cookies = cookieHeader.split(';').filter(Boolean).map(c => c.trim().split('=')[0])

  return new Response(JSON.stringify({
    cookies_present: !!cookieHeader,
    cookie_count: cookies.length,
    keys: cookies,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
