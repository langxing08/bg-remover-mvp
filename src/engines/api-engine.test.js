import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiEngine } from './api-engine'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = mockFetch
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

  it('should POST to /api/remove-bg and return a Blob on success', async () => {
    const fakeBlob = new Blob(['fake-png'], { type: 'image/png' })
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(fakeBlob),
    })

    const engine = new ApiEngine()
    const file = new File(['test'], 'photo.png', { type: 'image/png' })
    const result = await engine.removeBackground(file)

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith('/api/remove-bg', {
      method: 'POST',
      body: expect.any(FormData),
    })
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
