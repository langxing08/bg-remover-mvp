/**
 * Google OAuth callback — exchange code for token, set session cookie
 */

export async function onRequest(context) {
  const { request, env } = context

  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error || !code) {
      return redirectWithError(env, error || 'No authorization code')
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${env.APP_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      return redirectWithError(env, `Token exchange failed: ${errText}`)
    }

    const tokens = await tokenResponse.json()

    // Get user info from Google
    const userResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )

    if (!userResponse.ok) {
      return redirectWithError(env, 'Failed to get user info')
    }

    const user = await userResponse.json()
    const now = new Date().toISOString()

    // Save to D1 (insert or update)
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO users (google_id, email, name, picture, created_at, last_login_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(google_id) DO UPDATE SET
           email = ?2, name = ?3, picture = ?4, last_login_at = ?6`
      ).bind(user.id, user.email, user.name, user.picture, now, now).run()
    }

    // Create a simple signed session token
    const sessionData = JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      iat: Date.now(),
    })

    // Sign with HMAC
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign(
      'HMAC', key,
      encoder.encode(sessionData)
    )
    const sigHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    const token = `${btoa(sessionData)}.${sigHex}`

    // Redirect back to frontend with session cookie
    // Note: We use new Response() instead of Response.redirect() because
    // Cloudflare Workers marks redirect() headers as immutable, making
    // headers.append() throw "Can't modify immutable headers".
    const frontendUrl = new URL(env.APP_URL)
    const headers = new Headers({
      'Location': frontendUrl.toString(),
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    })
    return new Response(null, { status: 302, headers })
  } catch (err) {
    return redirectWithError(env, err.message)
  }
}

function redirectWithError(env, message) {
  const url = new URL(env.APP_URL)
  url.searchParams.set('auth_error', message.slice(0, 100))
  return Response.redirect(url.toString(), 302)
}
