import assert from 'node:assert/strict'
import test from 'node:test'
import { RenderDiagnostics } from '../src/core/RenderDiagnostics.ts'

test('render diagnostics publishes 120-frame samples and starts a fresh interval window', () => {
  const container = { dataset: {} }
  const renderer = {
    info: { render: { calls: 255, triangles: 483678 }, memory: { geometries: 47, textures: 22 } },
    domElement: { width: 1280, height: 720 },
    getPixelRatio: () => 1,
  }
  const diagnostics = new RenderDiagnostics(container, renderer)
  for (let frame = 0; frame < 119; frame++) diagnostics.update(frame * 10, 'high')
  assert.deepEqual(container.dataset, {})
  diagnostics.update(1190, 'high')
  assert.deepEqual(container.dataset, {
    renderCalls: '255', triangles: '483678', geometries: '47', textures: '22',
    drawingBuffer: '1280x720', pixelRatio: '1', frameIntervalMs: '10.00', quality: 'high',
  })
  for (let frame = 0; frame < 120; frame++) diagnostics.update(10000 + frame * 20, 'low')
  assert.equal(container.dataset.frameIntervalMs, '20.00')
  assert.equal(container.dataset.quality, 'low')
})
