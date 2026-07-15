import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WasmEngine } from './wasm-engine'

// Mock @imgly/background-removal — tests must not depend on real WASM model
vi.mock('@imgly/background-removal', () => ({
  removeBackground: vi.fn(),
  preload: vi.fn().mockResolvedValue(undefined),
}))

describe('WasmEngine', () => {
  let engine

  beforeEach(() => {
    vi.clearAllMocks()
    engine = new WasmEngine()
  })

  it('should have removeBackground method', () => {
    expect(engine.removeBackground).toBeInstanceOf(Function)
  })

  it('should call @imgly removeBackground and return a Blob', async () => {
    const { removeBackground } = await import('@imgly/background-removal')
    const fakeBlob = new Blob(['fake-png'], { type: 'image/png' })
    removeBackground.mockResolvedValue(fakeBlob)

    const file = new File(['test'], 'photo.png', { type: 'image/png' })
    const result = await engine.removeBackground(file)

    expect(removeBackground).toHaveBeenCalledOnce()
    expect(removeBackground).toHaveBeenCalledWith(file, expect.any(Object))
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/png')
  })

  it('should reject when called without a file', async () => {
    await expect(engine.removeBackground()).rejects.toThrow()
  })

  it('should reject when called with null', async () => {
    await expect(engine.removeBackground(null)).rejects.toThrow()
  })
})
