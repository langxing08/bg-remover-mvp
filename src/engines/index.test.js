import { describe, it, expect } from 'vitest'
import { createEngine } from './index'

describe('createEngine', () => {
  it('returns api engine by default', () => {
    const engine = createEngine()
    expect(engine.constructor.name).toBe('ApiEngine')
  })

  it('returns wasm engine when type is "wasm"', () => {
    const engine = createEngine('wasm')
    expect(engine.constructor.name).toBe('WasmEngine')
  })

  it('returns api engine when type is "api"', () => {
    const engine = createEngine('api')
    expect(engine.constructor.name).toBe('ApiEngine')
  })

  it('throws for unknown engine type', () => {
    expect(() => createEngine('unknown')).toThrow('Unknown engine type')
  })
})
