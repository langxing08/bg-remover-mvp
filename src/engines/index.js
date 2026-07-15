import { WasmEngine } from './wasm-engine'
import { ApiEngine } from './api-engine'

const ENGINE_MAP = {
  wasm: WasmEngine,
  api: ApiEngine,
}

/**
 * Create a background removal engine by type.
 *
 * @param {'wasm'|'api'} [type='wasm'] - Engine type.
 *   Defaults to `VITE_ENGINE` env var, or `'wasm'` if not set.
 * @param {object} [options] - Engine-specific options (e.g. onProgress).
 * @returns {WasmEngine|ApiEngine}
 */
export function createEngine(type, options) {
  const resolvedType = type || import.meta.env.VITE_ENGINE || 'wasm'
  const EngineClass = ENGINE_MAP[resolvedType]

  if (!EngineClass) {
    throw new Error(`Unknown engine type: "${resolvedType}". Supported: ${Object.keys(ENGINE_MAP).join(', ')}`)
  }

  return new EngineClass(options)
}
