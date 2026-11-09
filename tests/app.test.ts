import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RitualController } from '../src/interaction/RitualController.ts'

// Real App/controller/asset loaders, with only browser/GPU and WASM boundaries replaced.
class Element extends EventTarget {
  dataset: Record<string, string> = {}
  disabled = true
  hidden = false
  textContent = ''
  clientWidth = 800
  clientHeight = 600
  children: Element[] = []
  removed = false
  failBinding = false
  attributes = new Map<string, string>()
  setAttribute(name: string, value: string) { this.attributes.set(name, value) }
  append(child: Element) { this.children.push(child) }
  remove() { this.removed = true }
  override addEventListener(...args: Parameters<EventTarget['addEventListener']>) {
    if (this.failBinding && args[0] === 'click') throw new Error('Binding failed')
    super.addEventListener(...args)
  }
}
class Renderer {
  static instances: Renderer[] = []
  domElement = new Element()
  shadowMap = {}
  info = { autoReset: true, reset() {} }
  loop: ((time: number) => void) | null = null
  disposals = 0
  pixelRatio = 1
  width = 0
  height = 0
  constructor() { Renderer.instances.push(this) }
  setAnimationLoop(loop: Renderer['loop']) { this.loop = loop }
  setPixelRatio(value: number) { this.pixelRatio = value }
  setSize(width: number, height: number) { this.width = width; this.height = height }
  dispose() { this.disposals++ }
}
class Controls {
  static instances: Controls[] = []
  readonly camera: THREE.PerspectiveCamera
  target = new THREE.Vector3()
  minDistance = 0
  maxDistance = 0
  minPolarAngle = 0
  maxPolarAngle = 0
  dampingFactor = 0
  disposals = 0
  constructor(camera: THREE.PerspectiveCamera) { this.camera = camera; Controls.instances.push(this) }
  update() {}
  dispose() { this.disposals++ }
}
class Observer {
  static instances: Observer[] = []
  disconnects = 0
  readonly notify: () => void
  constructor(notify: () => void) { this.notify = notify; Observer.instances.push(this) }
  observe() {}
  disconnect() { this.disconnects++ }
}
class Pipeline {
  static instances: Pipeline[] = []
  disposals = 0
  changes = 0
  constructor() { Pipeline.instances.push(this) }
  resize() {}
  render() {}
  setQuality() { this.changes++ }
  dispose() { this.disposals++ }
}
class Seal {
  mesh = new THREE.Mesh()
  update() {}
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Not initialized') }
  let reject: (error: Error) => void = () => { throw new Error('Not initialized') }
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
class Physics {
  disposals = 0
  reset() {}
  step() {}
  dispose() { this.disposals++ }
}
let physicsRequest = deferred<Physics>()
let scene: THREE.Scene
let sharedStone: THREE.Material
let slot: { container: THREE.Group; fallback: THREE.Group; asset: { path: string; height: number } }
mock.module('three', { namedExports: { ...THREE, WebGLRenderer: Renderer } })
mock.module('three/addons/controls/OrbitControls.js', { namedExports: { OrbitControls: Controls } })
mock.module('../src/core/RenderingPipeline.ts', { namedExports: { RenderingPipeline: Pipeline } })
mock.module('../src/effects/MagicSeal.ts', { namedExports: { MagicSeal: Seal } })
mock.module('../src/physics/PhysicsWorld.ts', { namedExports: { PhysicsWorld: { create: () => physicsRequest.promise } } })
mock.module('../src/scene/createLighting.ts', { namedExports: {
  CANDLE_BASE_INTENSITY: 1,
  createLighting: (value: THREE.Scene) => { scene = value; return { candleLights: [] } },
} })
mock.module('../src/scene/createChapel.ts', { namedExports: { createChapel: (materials: { oldStone: THREE.Material }) => {
  const group = new THREE.Group()
  const artifact = new THREE.Group()
  sharedStone = materials.oldStone
  artifact.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedStone))
  slot = { container: new THREE.Group(), fallback: new THREE.Group(), asset: { path: 'models/test.gltf', height: 2 } }
  slot.container.add(slot.fallback)
  group.add(artifact, slot.container)
  return { group, artifact, modelSlots: [slot], colliders: [], candlePositions: [], altarSurface: new THREE.Vector3() }
} } })
const { App } = await import('../src/core/App.ts')
const flush = async () => { await new Promise<void>((resolve) => setImmediate(resolve)) }

function fixture(context: test.TestContext, pendingModel = false, failModel = false, failTexture = false) {
  function global(name: string, value: unknown) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    context.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
  physicsRequest = deferred<Physics>()
  const document = Object.assign(new EventTarget(), { hidden: false })
  global('document', document)
  global('window', { matchMedia: () => ({ matches: false }), devicePixelRatio: 1 })
  global('location', { search: '' })
  global('ResizeObserver', Observer)
  context.mock.method(console, 'error', () => {})
  context.mock.method(console, 'warn', () => {})
  context.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => {
    if (failTexture) throw new Error('Missing optional texture')
    return new THREE.Texture()
  })
  const source = new THREE.Group()
  source.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
  const modelRequest = deferred<{ scene: THREE.Group }>()
  context.mock.method(GLTFLoader.prototype, 'loadAsync', () => failModel ? Promise.reject(new Error('Missing model'))
    : pendingModel ? modelRequest.promise : Promise.resolve({ scene: source }))
  const container = new Element()
  const ui = { activateButton: new Element(), resetButton: new Element(), status: new Element(), assetStatus: new Element(),
    qualityButton: new Element(), menu: new Element(), menuToggle: new Element() }
  // Minimal DOM fixture; tests run with Node's TypeScript stripping.
  const app = new App(container, ui)
  context.after(() => app.dispose())
  return { app, container, ui, source, modelRequest, renderer: Renderer.instances[Renderer.instances.length - 1],
    pipeline: Pipeline.instances[Pipeline.instances.length - 1], observer: Observer.instances[Observer.instances.length - 1], controls: Controls.instances[Controls.instances.length - 1] }
}

test('App disposes before async physics and assets finish; late resources are freed once', async (context) => {
  const f = fixture(context, true)
  await flush()
  const physics = new Physics()
  const geometry = f.source.children[0].geometry
  const dispose = context.mock.method(geometry, 'dispose')
  f.app.dispose()
  f.app.dispose()
  physicsRequest.resolve(physics)
  f.modelRequest.resolve({ scene: f.source })
  await flush()
  assert.equal(physics.disposals, 1)
  assert.equal(dispose.mock.callCount(), 1)
  assert.equal(slot.container.children.length, 1)
  assert.equal(f.container.dataset.assets, 'loading')
  assert.equal(f.renderer.loop, null)
  assert.equal(f.renderer.disposals, 1)
  assert.equal(f.pipeline.disposals, 1)
  assert.equal(f.observer.disconnects, 1)
  assert.equal(f.controls.disposals, 1)
  f.ui.qualityButton.dispatchEvent(new Event('click'))
  assert.equal(f.pipeline.changes, 0)
})

test('App binding failure rolls back ritual groups, listeners and owned resources immediately', async (context) => {
  const f = fixture(context)
  const materialDispose = context.mock.method(sharedStone, 'dispose')
  const dispose = context.mock.method(RitualController.prototype, 'dispose')
  f.ui.resetButton.failBinding = true
  const physics = new Physics()
  physicsRequest.resolve(physics)
  await flush()
  assert.equal(dispose.mock.callCount(), 1)
  assert.equal(scene.getObjectByName('Ritual stones'), undefined)
  assert.equal(scene.getObjectByName('Ritual energy'), undefined)
  assert.equal(physics.disposals, 1)
  assert.equal(materialDispose.mock.callCount(), 0)
  assert.equal(f.container.dataset.assets, 'error')
  assert.equal(f.ui.assetStatus.textContent, 'Chapel initialization failed.')
  const state = f.container.dataset.ritualState
  f.ui.activateButton.dispatchEvent(new Event('click'))
  assert.equal(f.container.dataset.ritualState, state)
  f.app.dispose()
  assert.equal(physics.disposals, 1)
  assert.equal(materialDispose.mock.callCount(), 1)
})

test('App reports physics failure after scene creation and can dispose repeatedly', async (context) => {
  const f = fixture(context)
  physicsRequest.reject(new Error('WASM failure'))
  await flush()
  assert.equal(f.container.dataset.assets, 'error')
  assert.equal(f.ui.activateButton.disabled, true)
  f.app.dispose()
  f.app.dispose()
  assert.equal(f.renderer.disposals, 1)
})

test('App reports real model outcomes and successful initialization enables activation and Reset', async (context) => {
  const f = fixture(context)
  physicsRequest.resolve(new Physics())
  await flush()
  assert.equal(f.container.dataset.assets, 'ready')
  f.ui.activateButton.dispatchEvent(new Event('click'))
  assert.equal(f.container.dataset.ritualState, 'activating')
  f.ui.resetButton.dispatchEvent(new Event('click'))
  assert.equal(f.container.dataset.ritualState, 'idle')
})

test('App reports degraded for a failed configured model', async (context) => {
  const f = fixture(context, false, true)
  physicsRequest.resolve(new Physics())
  await flush()
  assert.equal(f.container.dataset.assets, 'degraded')
  assert.equal(f.ui.assetStatus.textContent, 'Some chapel models could not load. Reload to retry.')
  assert.equal(slot.fallback.visible, true)
})


test('App keeps optional texture failure nonfatal and records its paths', async (context) => {
  const f = fixture(context, false, false, true)
  physicsRequest.resolve(new Physics())
  await flush()
  assert.equal(f.container.dataset.assets, 'ready')
  assert.ok(JSON.parse(f.container.dataset.missingOptionalTextures).includes('textures/stone-color.webp'))
  assert.equal(f.ui.activateButton.disabled, false)
})

test('App teardown and remount leave one loop and one set of button listeners', async (context) => {
  const f = fixture(context)
  physicsRequest.resolve(new Physics())
  await flush()
  f.ui.qualityButton.dispatchEvent(new Event('click'))
  f.app.dispose()
  physicsRequest = deferred<Physics>()
  const replacement = new App(f.container, f.ui)
  context.after(() => replacement.dispose())
  physicsRequest.resolve(new Physics())
  await flush()
  assert.equal(f.ui.qualityButton.textContent, 'Quality: High')
  assert.equal(f.ui.qualityButton.attributes.get('aria-pressed'), 'false')
  assert.equal(Renderer.instances.filter((renderer) => renderer.loop !== null).length, 1)
  const activate = context.mock.method(RitualController.prototype, 'activate')
  f.ui.activateButton.dispatchEvent(new Event('click'))
  assert.equal(activate.mock.callCount(), 1)
  replacement.dispose()
  f.ui.activateButton.dispatchEvent(new Event('click'))
  f.ui.qualityButton.dispatchEvent(new Event('click'))
  assert.equal(activate.mock.callCount(), 1)
  assert.equal(Renderer.instances.filter((renderer) => renderer.loop !== null).length, 0)
  assert.ok(Observer.instances.every((observer) => observer.disconnects === 1))
  assert.ok(Pipeline.instances.every((pipeline) => pipeline.disposals === 1))
})

test('extracted UI toggles the menu, updates quality and removes its listeners on teardown', async (context) => {
  const f = fixture(context)
  physicsRequest.resolve(new Physics())
  await flush()
  f.ui.menuToggle.dispatchEvent(new Event('click'))
  assert.equal(f.ui.menu.hidden, true)
  assert.equal(f.ui.menuToggle.textContent, 'Show UI')
  assert.equal(f.ui.menuToggle.attributes.get('aria-expanded'), 'false')
  f.ui.menuToggle.dispatchEvent(new Event('click'))
  assert.equal(f.ui.menu.hidden, false)
  assert.equal(f.ui.menuToggle.textContent, 'Hide UI')
  assert.equal(f.ui.menuToggle.attributes.get('aria-expanded'), 'true')
  f.ui.qualityButton.dispatchEvent(new Event('click'))
  assert.equal(f.ui.qualityButton.textContent, 'Quality: Low')
  assert.equal(f.ui.qualityButton.attributes.get('aria-pressed'), 'true')
  assert.equal(f.pipeline.changes, 1)
  f.app.dispose()
  f.ui.menuToggle.dispatchEvent(new Event('click'))
  f.ui.qualityButton.dispatchEvent(new Event('click'))
  assert.equal(f.ui.menu.hidden, false)
  assert.equal(f.pipeline.changes, 1)
})

test('scene configuration preserves the camera, fog and orbit limits', async (context) => {
  const f = fixture(context)
  assert.equal(f.controls.camera.fov, 45)
  assert.equal(f.controls.camera.near, 0.1)
  assert.equal(f.controls.camera.far, 90)
  assert.deepEqual(f.controls.target.toArray(), [0, 2.1, -0.6])
  assert.equal(f.controls.minDistance, 6)
  assert.equal(f.controls.maxDistance, 36)
  assert.equal(f.controls.minPolarAngle, 0.12)
  assert.equal(f.controls.maxPolarAngle, Math.PI * 0.49)
  assert.equal(f.controls.dampingFactor, 0.06)
  assert.ok(scene.background instanceof THREE.Color)
  assert.equal(scene.background.getHexString(), '0b1019')
  assert.ok(scene.fog instanceof THREE.FogExp2)
  assert.equal(scene.fog.color.getHexString(), '101722')
  assert.equal(scene.fog.density, 0.025)
  physicsRequest.resolve(new Physics())
  await flush()
})

test('extracted viewport resizes the camera and applies quality pixel ratios and shadows', async (context) => {
  const f = fixture(context)
  physicsRequest.resolve(new Physics())
  await flush()
  Object.assign(window, { devicePixelRatio: 3 })
  f.container.clientWidth = 1200
  f.container.clientHeight = 600
  f.observer.notify()
  assert.equal(f.controls.camera.aspect, 2)
  assert.equal(f.renderer.width, 1200)
  assert.equal(f.renderer.height, 600)
  assert.equal(f.renderer.pixelRatio, 1.5)
  const moon = new THREE.DirectionalLight()
  scene.add(moon)
  f.ui.qualityButton.dispatchEvent(new Event('click'))
  assert.equal(f.renderer.pixelRatio, 1)
  assert.equal(moon.shadow.mapSize.x, 512)
  f.ui.qualityButton.dispatchEvent(new Event('click'))
  assert.equal(f.renderer.pixelRatio, 1.5)
  assert.equal(moon.shadow.mapSize.x, 1024)
})
