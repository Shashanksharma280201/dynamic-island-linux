import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, net: {}, protocol: {} }))
import { safeJoin, MODELS, MODEL_FILES } from '../electron/stt'

test('files are only served from inside their folder', () => {
  expect(safeJoin('/models/a', 'onnx/x.onnx')).toBe('/models/a/onnx/x.onnx')
  expect(safeJoin('/models/a', '/config.json')).toBe('/models/a/config.json')
  expect(safeJoin('/models/a', '../b/secret')).toBeNull()
  expect(safeJoin('/models/a', '%2e%2e/%2e%2e/etc/passwd')).toBeNull()
  expect(safeJoin('/models/a', 'x/../../a2/y')).toBeNull()
  expect(safeJoin('/models/a', '')).toBe('/models/a')
})

test('English Whisper models with quantized weights', () => {
  expect(MODELS.tiny.id).toBe('Xenova/whisper-tiny.en')
  expect(MODELS.base.id).toBe('Xenova/whisper-base.en')
  expect(MODEL_FILES).toContain('onnx/encoder_model_quantized.onnx')
  expect(MODEL_FILES).toContain('tokenizer.json')
})
