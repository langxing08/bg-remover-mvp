/**
 * API-based background removal engine (Phase 2).
 *
 * Converts the image to base64, sends it as JSON to the proxy endpoint,
 * which forwards to remove.bg. The API key stays on the server.
 */
export class ApiEngine {
  /**
   * Remove the background from an image file via the API proxy.
   *
   * @param {File} file - The image file to process.
   * @returns {Promise<Blob>} A PNG blob with the background removed.
   */
  async removeBackground(file) {
    if (!file) {
      throw new Error('A file must be provided')
    }

    // Read file as base64 data URL, then strip the preamble
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result
        const comma = dataUrl.indexOf(',')
        resolve(dataUrl.substring(comma + 1))
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })

    const response = await fetch('/api/remove-bg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: base64,
        filename: file.name,
        content_type: file.type,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Background removal failed: ${errorText}`)
    }

    return response.blob()
  }
}
