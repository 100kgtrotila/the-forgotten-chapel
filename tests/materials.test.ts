import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createChapelMaterials } from '../src/scene/materials.ts'

test('missing optional texture configuration keeps usable untextured materials', async (context) => {
  const load = context.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => { throw new Error('Unexpected request') })
  const { materials, ready } = createChapelMaterials(new AbortController().signal, { stone: {}, floor: {}, metal: {} })
  await ready
  assert.equal(load.mock.callCount(), 0)
  assert.equal(materials.oldStone.map, null)
  assert.ok(materials.oldStone instanceof THREE.MeshStandardMaterial)
})

test('color and data maps use the correct color spaces and shared tiled textures', async (context) => {
  context.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => new THREE.Texture())
  const { materials, ready } = createChapelMaterials(new AbortController().signal, {
    stone: { color: 'textures/stone-color.webp', normal: 'textures/stone-normal.webp', repeat: [2, 3] },
    floor: {}, metal: {},
  })
  await ready
  assert.equal(materials.oldStone.map?.colorSpace, THREE.SRGBColorSpace)
  assert.equal(materials.oldStone.normalMap?.colorSpace, THREE.NoColorSpace)
  assert.equal(materials.oldStone.map?.wrapS, THREE.RepeatWrapping)
  assert.deepEqual(materials.oldStone.map?.repeat.toArray(), [2, 3])
  assert.equal(materials.oldStone.map, materials.stoneVariants[0].map)
})

test('texture failure does not replace material fallback or reject startup', async (context) => {
  context.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => { throw new Error('Invalid image') })
  context.mock.method(console, 'warn', () => {})
  const { materials, ready } = createChapelMaterials(new AbortController().signal, {
    stone: { color: 'textures/missing.webp' }, floor: {}, metal: {},
  })
  await ready
  assert.equal(materials.oldStone.map, null)
})

test('packed AO and roughness maps reuse one linear texture request', async (context) => {
  const load = context.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => new THREE.Texture())
  const { materials, ready } = createChapelMaterials(new AbortController().signal, {
    stone: { roughness: 'textures/stone-arm.webp', ao: 'textures/stone-arm.webp' },
    floor: { roughness: 'textures/stone-arm.webp', ao: 'textures/stone-arm.webp' }, metal: {},
  })
  await ready
  assert.equal(load.mock.callCount(), 1)
  assert.equal(materials.oldStone.roughnessMap, materials.oldStone.aoMap)
  assert.equal(materials.oldStone.aoMap, materials.floor.aoMap)
  assert.equal(materials.oldStone.aoMap?.colorSpace, THREE.NoColorSpace)
})

test('textures arriving after teardown are disposed instead of attached to materials', async (context) => {
  let complete: (texture: THREE.Texture) => void = () => { throw new Error('Request not started') }
  const request = new Promise<THREE.Texture>((resolve) => { complete = resolve })
  context.mock.method(THREE.TextureLoader.prototype, 'loadAsync', () => request)
  const controller = new AbortController()
  const { materials, ready } = createChapelMaterials(controller.signal, {
    stone: { color: 'textures/stone-color.webp' }, floor: {}, metal: {},
  })
  const texture = new THREE.Texture()
  let disposed = false
  texture.addEventListener('dispose', () => { disposed = true })
  controller.abort()
  complete(texture)
  await ready
  assert.equal(materials.oldStone.map, null)
  assert.equal(disposed, true)
})
