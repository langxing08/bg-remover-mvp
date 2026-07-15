/**
 * API-based background removal engine (Phase 2).
 *
 * Sends the image to a server-side endpoint (`/api/remove-bg`)
 * which proxies to remove.bg. The API key stays on the server
 * and is never exposed to the client.
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

    const formData = new FormData()
    formData.append('image_file', file)

    const response = await fetch('/api/remove-bg', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Background removal failed: ${errorText}`)
    }

    return response.blob()
  }
}
