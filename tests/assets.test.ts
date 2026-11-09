import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createModelInstance, loadModelSlots, disposeObjectResources } from '../src/scene/assets.ts'
import type { ModelSlot } from '../src/scene/assets.ts'

function sourceModel(): THREE.Group {
  const source = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), new THREE.MeshStandardMaterial())
  mesh.position.set(3, 5, -2)
  source.add(mesh)
  return source
}

function modelSlot(path: string | null): ModelSlot {
  const container = new THREE.Group()
  const fallback = new THREE.Group()
  container.add(fallback)
  return { container, fallback, asset: { path, height: 2 } }
}

test('imported models are centered, grounded and scaled without changing source materials', () => {
  const source = sourceModel()
  const instance = createModelInstance(source, { path: 'models/test.glb', height: 2 })
  const bounds = new THREE.Box3().setFromObject(instance)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  assert.ok(Math.abs(bounds.min.y) < 1e-6)
  assert.ok(Math.abs(size.y - 2) < 1e-6)
  assert.ok(Math.abs(center.x) < 1e-6 && Math.abs(center.z) < 1e-6)
  const mesh = instance.getObjectByProperty('type', 'Mesh')
  const original = source.children[0]
  assert.ok(mesh instanceof THREE.Mesh && original instanceof THREE.Mesh)
  assert.equal(mesh.material, original.material)
  assert.equal(mesh.castShadow, true)
  assert.equal(mesh.receiveShadow, true)
  assert.equal(original.position.y, 5)
})

test('disabled models do not request files or hide their placeholders', async (context) => {
  const load = context.mock.method(GLTFLoader.prototype, 'loadAsync', async () => { throw new Error('Unexpected request') })
  const slot = modelSlot(null)
  await loadModelSlots([slot], new AbortController().signal)
  assert.equal(load.mock.callCount(), 0)
  assert.equal(slot.fallback.visible, true)
})

test('failed model requests retain the visible fallback and resolve safely', async (context) => {
  context.mock.method(GLTFLoader.prototype, 'loadAsync', async () => { throw new Error('Missing model') })
  context.mock.method(console, 'warn', () => {})
  const slot = modelSlot('models/missing.glb')
  await loadModelSlots([slot], new AbortController().signal)
  assert.equal(slot.fallback.visible, true)
  assert.equal(slot.container.children.length, 1)
})

test('repeated models share one request but have separate placed instances', async (context) => {
  const load = context.mock.method(GLTFLoader.prototype, 'loadAsync', async () => ({ scene: sourceModel() }))
  const slots = [modelSlot('models/statue.glb'), modelSlot('models/statue.glb')]
  await loadModelSlots(slots, new AbortController().signal)
  assert.equal(load.mock.callCount(), 1)
  assert.ok(slots.every((slot) => !slot.fallback.visible && slot.container.children.length === 2))
  assert.notEqual(slots[0].container.children[1], slots[1].container.children[1])
})

test('resource cleanup disposes shared geometry, material and texture once', () => {
  const texture = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ map: texture })
  const geometry = new THREE.BoxGeometry()
  const root = new THREE.Group()
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
  let disposed = 0
  for (const resource of [geometry, material, texture]) resource.addEventListener('dispose', () => disposed++)
  disposeObjectResources(root)
  assert.equal(disposed, 3)
})

test('aged stone treatment stays matte, shares statue materials and leaves other assets unchanged', async (context) => {
  context.mock.method(GLTFLoader.prototype, 'loadAsync', async () => ({ scene: sourceModel() }))
  const statues = [modelSlot('models/statue.glb'), modelSlot('models/statue.glb')]
  for (const slot of statues) slot.asset.surface = 'agedStone'
  const gate = modelSlot('models/gate.glb')
  await loadModelSlots([...statues, gate], new AbortController().signal)
  const meshes = [...statues, gate].map((slot) => {
    const mesh = slot.container.getObjectByProperty('type', 'Mesh')
    assert.ok(mesh instanceof THREE.Mesh)
    return mesh
  })
  const [left, right, original] = meshes.map((mesh) => mesh.material)
  assert.ok(left instanceof THREE.MeshStandardMaterial)
  assert.ok(original instanceof THREE.MeshStandardMaterial)
  assert.equal(left, right)
  assert.equal(left.metalness, 0)
  assert.equal(left.roughness, 0.96)
  assert.equal(left.roughnessMap, null)
  assert.equal(left.color.getHexString(), '767b70')
  assert.equal(original.color.getHexString(), 'ffffff')
  assert.equal(original.roughness, 1)
  for (const slot of statues) {
    const bounds = new THREE.Box3().setFromObject(slot.container)
    assert.ok(Math.abs(bounds.min.y) < 1e-6)
    assert.ok(Math.abs(bounds.max.y - 2) < 1e-6)
  }
})

test('late model completion after teardown does not replace fallbacks and releases resources', async (context) => {
  let complete: (value: { scene: THREE.Group }) => void = () => { throw new Error('Request not started') }
  const request = new Promise<{ scene: THREE.Group }>((resolve) => { complete = resolve })
  context.mock.method(GLTFLoader.prototype, 'loadAsync', () => request)
  const slot = modelSlot('models/statue.glb')
  const controller = new AbortController()
  const source = sourceModel()
  let geometryDisposed = false
  const mesh = source.children[0]
  assert.ok(mesh instanceof THREE.Mesh)
  mesh.geometry.addEventListener('dispose', () => { geometryDisposed = true })
  const loading = loadModelSlots([slot], controller.signal)
  controller.abort()
  complete({ scene: source })
  await loading
  assert.equal(slot.fallback.visible, true)
  assert.equal(slot.container.children.length, 1)
  assert.equal(geometryDisposed, true)
})

test('empty models retain the fallback instead of introducing invalid transforms', async (context) => {
  context.mock.method(GLTFLoader.prototype, 'loadAsync', async () => ({ scene: new THREE.Group() }))
  context.mock.method(console, 'warn', () => {})
  const slot = modelSlot('models/empty.glb')
  await loadModelSlots([slot], new AbortController().signal)
  assert.equal(slot.fallback.visible, true)
  assert.equal(slot.container.children.length, 1)
})

test('model outcomes distinguish successful, failed and intentionally procedural slots', async (context) => {
  context.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => {
    if (url.includes('missing')) throw new Error('Missing model')
    return { scene: sourceModel() }
  })
  context.mock.method(console, 'warn', () => {})
  const slots = [modelSlot('models/angel.glb'), modelSlot('models/missing.glb'), modelSlot(null)]
  const outcome = await loadModelSlots(slots, new AbortController().signal)
  assert.deepEqual(outcome, {
    loadedModelIds: ['model-slot-1'], failedModelIds: ['model-slot-2'],
    skippedOptionalSlots: ['model-slot-3'], missingResources: ['models/missing.glb'],
  })
})

test('abort during a mixed batch does not dispose resources already owned by the scene twice', async (context) => {
  let finish: (value: { scene: THREE.Group }) => void = () => { throw new Error('Not started') }
  const pending = new Promise<{ scene: THREE.Group }>((resolve) => { finish = resolve })
  const attached = sourceModel()
  const late = sourceModel()
  context.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => {
    return url.includes('late') ? pending : { scene: attached }
  })
  const slot = modelSlot('models/attached.glb')
  const controller = new AbortController()
  const mesh = attached.children[0]
  assert.ok(mesh instanceof THREE.Mesh)
  const dispose = context.mock.method(mesh.geometry, 'dispose')
  const loading = loadModelSlots([slot, modelSlot('models/late.glb')], controller.signal)
  await new Promise<void>((resolve) => setImmediate(resolve))
  controller.abort()
  disposeObjectResources(slot.container)
  finish({ scene: late })
  await loading
  assert.equal(dispose.mock.callCount(), 1)
})
