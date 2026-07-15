import { describe, it, expect } from 'vitest'
import { ApiEngine } from './api-engine'

describe('ApiEngine', () => {
  it('should have removeBackground method', () => {
    const engine = new ApiEngine()
    expect(engine.removeBackground).toBeInstanceOf(Function)
  })

  it('should throw "not implemented" when called', async () => {
    const engine = new ApiEngine()
    await expect(engine.removeBackground()).rejects.toThrow(/not implemented/i)
  })
})
