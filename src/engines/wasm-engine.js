import { removeBackground } from '@imgly/background-removal'

/**
 * WASM-based background removal engine.
 * Runs entirely in the browser using @imgly/background-removal.
 * No image data is sent to any server.
 */
export class WasmEngine {
  /**
   * @param {object} [options]
   * @param {(phase: string, pct: number) => void} [options.onProgress] - Progress callback.
   *   phase: human-readable stage name; pct: 0–100 estimate.
   */
  constructor(options = {}) {
    this._onProgress = options.onProgress || (() => {})
  }

  /**
   * Remove the background from an image file.
   *
   * @param {File} file - The image file to process.
   * @returns {Promise<Blob>} A PNG blob with the background removed.
   */
  async removeBackground(file) {
    if (!file) {
      throw new Error('A file must be provided')
    }

    this._onProgress('Downloading AI model...', 10)

    return removeBackground(file, {
      model: 'isnet_fp16',
      output: {
        format: 'image/png',
      },
      progress: (_key, _current, _total) => {
        this._onProgress('Removing background...', 40)
      },
    })
  }
}
