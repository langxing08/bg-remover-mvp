import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiEngine } from './api-engine'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = mockFetch

  // Mock FileReader for Node test environment
  globalThis.FileReader = vi.fn(function () {
    this.result = null
    this.onload = null
    this.onerror = null
    this.readAsDataURL = vi.fn(function (file) {
      // Simulate async FileReader with a tiny delay
      setTimeout(() => {
        this.result = 'data:image/png;base64,dGVzdC1kYXRh' // base64 of "test-data"
        if (this.onload) this.onload()
      }, 0)
    })
  })
})

describe('ApiEngine', () => {
  it('should have removeBackground method', () => {
    const engine = new ApiEngine()
    expect(engine.removeBackground).toBeInstanceOf(Function)
  })

  it('should throw when called without a file', async () => {
    const engine = new ApiEngine()
    await expect(engine.removeBackground()).rejects.toThrow()
  })

  it('should POST base64 JSON to /api/remove-bg and return a Blob on success', async () => {
    const fakeBlob = new Blob(['fake-png'], { type: 'image/png' })
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
    })

    const engine = new ApiEngine()
    const file = new File(['test-data'], 'photo.png', { type: 'image/png' })
    const result = await engine.removeBackground(file)

    // Should have called fetch with JSON containing image_base64
    expect(mockFetch).toHaveBeenCalledOnce()
    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[0]).toBe('/api/remove-bg')
    expect(callArgs[1].method).toBe('POST')
    expect(callArgs[1].headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(callArgs[1].body)
    expect(body.image_base64).toBeTypeOf('string')
    expect(body.filename).toBe('photo.png')
    expect(body.content_type).toBe('image/png')

    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/png')
  })

  it('should throw when API returns error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    })

    const engine = new ApiEngine()
    const file = new File(['test'], 'photo.png', { type: 'image/png' })
    await expect(engine.removeBackground(file)).rejects.toThrow(/Forbidden/)
  })
})
