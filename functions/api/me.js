/**
 * Get current user info from session cookie
 */

export async function onRequest(context) {
  const { request, env } = context

  // Parse cookie header
  const cookieHeader = request.headers.get('Cookie') || ''
  const cookies = Object.fromEntries(
    cookieHeader.split(';').filter(Boolean).map(c => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    })
  )

  const token = cookies.session
  if (!token) {
    return new Response(JSON.stringify({ user: null }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify and decode session
  try {
    const [encodedData, sigHex] = token.split('.')

    // Verify signature
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const sigBytes = new Uint8Array(
      sigHex.match(/.{2}/g).map(b => parseInt(b, 16))
    )

    const valid = await crypto.subtle.verify(
      'HMAC', key,
      sigBytes,
      encoder.encode(atob(encodedData))
    )

    if (!valid) {
      return new Response(JSON.stringify({ user: null }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const user = JSON.parse(atob(encodedData))

    // Check expiry (24 hours)
    if (Date.now() - user.iat > 86400000) {
      return new Response(JSON.stringify({ user: null }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ user }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ user: null }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
