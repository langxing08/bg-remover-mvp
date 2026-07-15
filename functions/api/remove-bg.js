/**
 * Cloudflare Pages Function — remove.bg API proxy
 *
 * Forwards the raw multipart POST to remove.bg, injecting the API key.
 * The key is read from environment variables and never exposed to the client.
 */

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = env.REMOVE_BG_API_KEY
  if (!apiKey) {
    return new Response('REMOVE_BG_API_KEY not configured', { status: 500 })
  }

  try {
    // Forward raw body with only the essential headers
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': request.headers.get('Content-Type') || 'application/octet-stream',
      },
      body: await request.arrayBuffer(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(`remove.bg error (${response.status}): ${errorText}`, {
        status: response.status,
      })
    }

    // Return the processed image blob directly
    return new Response(response.body, {
      headers: { 'Content-Type': 'image/png' },
    })
  } catch (err) {
    return new Response(`Internal error: ${err.message}`, { status: 500 })
  }
}
