/**
 * Cloudflare Pages Function — remove.bg API proxy
 *
 * Receives multipart POST with `file` field, forwards to remove.bg,
 * returns the processed PNG image. The API key is read from environment
 * variables (REMOVE_BG_API_KEY) and never exposed to the client.
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
    const formData = await request.formData()
    const imageFile = formData.get('file')

    if (!imageFile) {
      return new Response('Missing "file" field in form data', { status: 400 })
    }

    // Build request to remove.bg
    const removeBgBody = new FormData()
    removeBgBody.append('image_file', imageFile)
    removeBgBody.append('size', 'auto')

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: removeBgBody,
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
