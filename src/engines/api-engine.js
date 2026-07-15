/**
 * API-based background removal engine (Phase 2).
 *
 * Placeholder for future third-party API integration (e.g. remove.bg).
 */
export class ApiEngine {
  /**
   * Remove the background from an image file via a third-party API.
   *
   * @param {File} _file - The image file to process.
   * @returns {Promise<Blob>} A PNG blob with the background removed.
   */
  async removeBackground(_file) {
    throw new Error(
      'API engine is not implemented yet. ' +
      'Set VITE_ENGINE=wasm or implement the API integration.'
    )
  }
}
