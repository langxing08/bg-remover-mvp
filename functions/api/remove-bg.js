/**
 * Cloudflare Pages Function — remove.bg API proxy
 *
 * Receives JSON { image_base64, filename, content_type },
 * reconstructs FormData matching the official remove.bg sample code,
 * and forwards to https://api.remove.bg/v1.0/removebg
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
    const { image_base64, filename, content_type } = await request.json()

    if (!image_base64) {
      return new Response('Missing image_base64 in request body', { status: 400 })
    }

    // Decode base64 → Blob
    const binaryStr = atob(image_base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: content_type || 'image/png' })

    // Build FormData exactly like the official remove.bg sample code:
    //   formData.append("size", "auto");
    //   formData.append("image_file", blob);
    const formData = new FormData()
    formData.append('size', 'auto')
    formData.append('image_file', blob, filename || 'image')

    // Do NOT manually set Content-Type — fetch auto-sets it from FormData
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(`remove.bg error (${response.status}): ${errorText}`, {
        status: response.status,
      })
    }

    return new Response(response.body, {
      headers: { 'Content-Type': 'image/png' },
    })
  } catch (err) {
    return new Response(`Internal error: ${err.message}`, { status: 500 })
  }
}
