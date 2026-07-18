/**
 * Google OAuth login — redirects user to Google consent screen
 */

export async function onRequest(context) {
  const { env } = context

  const clientId = env.GOOGLE_CLIENT_ID
  const redirectUri = `${env.APP_URL}/api/auth/google/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  })

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  return Response.redirect(url, 302)
}
