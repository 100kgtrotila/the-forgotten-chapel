import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PhysicsWorld } from '../src/physics/PhysicsWorld.ts'
import { RitualController, bindRitualInteraction } from '../src/interaction/RitualController.ts'

test('ritual suspends stones, releases once and resets deterministically', async (context) => {
  const physics = await PhysicsWorld.create([{ center: [0, -0.1, 0], halfExtents: [10, 0.1, 10] }])
  context.after(() => physics.dispose())
  const artifact = new THREE.Group()
  artifact.position.set(0, 3.68, -0.85)
  const frames: number[][] = []
  const ritual = new RitualController({
    artifact, stoneMaterial: new THREE.MeshStandardMaterial(), physics,
    seal: { update: (time: number, intensity: number, activation: number) => { frames.push([time, intensity, activation]) } },
  })
  context.after(() => ritual.dispose())
  const initial = ritual.group.children.map((mesh) => mesh.position.toArray())
  ritual.update(0.5)
  assert.equal(physics.bodyCount, 0)
  assert.equal(ritual.state, 'idle')
  assert.equal(ritual.activate(), true)
  assert.equal(ritual.activate(), false)
  for (let i = 0; i < 210; i++) ritual.update(1 / 60)
  assert.equal(ritual.state, 'released')
  assert.equal(physics.bodyCount, 8)
  assert.equal(ritual.activate(), false)
  for (let cycle = 0; cycle < 5; cycle++) {
    ritual.reset()
    assert.equal(ritual.state, 'idle')
    assert.equal(physics.bodyCount, 0)
    assert.equal(ritual.group.children.length, 8)
    assert.deepEqual(ritual.group.children.map((mesh) => mesh.position.toArray()), initial)
    assert.equal(artifact.scale.x, 1)
    assert.equal(frames.at(-1)?.[2], 0)
    ritual.activate()
    ritual.update(0.4)
  }
  ritual.reset()
  ritual.update(2)
  assert.equal(ritual.state, 'idle')
  assert.equal(physics.bodyCount, 0)
})

test('ritual gathers and lifts fragments before an outward physical burst; reset clears the effects', async (context) => {
  const physics = await PhysicsWorld.create([{ center: [0, -0.1, 0], halfExtents: [10, 0.1, 10] }])
  context.after(() => physics.dispose())
  const artifact = new THREE.Group()
  artifact.position.y = 3.68
  const ritual = new RitualController({
    artifact, stoneMaterial: new THREE.MeshStandardMaterial(), physics, seal: { update: () => {} },
  })
  context.after(() => ritual.dispose())
  const initial = ritual.group.children.map((mesh) => mesh.position.clone())
  ritual.activate()
  for (let frame = 0; frame < 150; frame++) ritual.update(1 / 60)
  assert.equal(ritual.state, 'activating')
  assert.equal(physics.bodyCount, 0)
  assert.ok(artifact.position.y > 4, 'the relic rises while charging')
  const charged = ritual.group.children[0].position
  assert.ok(Math.hypot(charged.x, charged.z) < Math.hypot(initial[0].x, initial[0].z))
  for (let frame = 0; frame < 44; frame++) ritual.update(1 / 60)
  assert.equal(ritual.state, 'released')
  assert.equal(physics.bodyCount, 8)
  const releasedHeight = ritual.group.children[0].position.y
  for (let frame = 0; frame < 6; frame++) ritual.update(1 / 60)
  assert.ok(ritual.group.children[0].position.y > releasedHeight, 'the burst launches fragments upward before gravity takes over')
  ritual.reset()
  assert.equal(physics.bodyCount, 0)
  assert.equal(artifact.position.y, 3.68)
  assert.equal(ritual.effects.group.getObjectByName('Rising ritual embers')?.visible, false)
  assert.equal(ritual.effects.group.getObjectByName('Ritual shockwave')?.visible, false)
  assert.deepEqual(ritual.group.children.map((mesh) => mesh.position.toArray()), initial.map((point) => point.toArray()))
  ritual.activate()
  ritual.update(2, false)
  assert.equal(ritual.effects.group.getObjectByName('Rising ritual embers')?.visible, false, 'reduced motion suppresses moving particles')
  ritual.reset()
  const resources = new Set<THREE.BufferGeometry | THREE.Material>()
  ritual.effects.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return
    resources.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material)
  })
  let disposed = 0
  for (const resource of resources) resource.addEventListener('dispose', () => disposed++)
  ritual.dispose()
  ritual.dispose()
  assert.equal(disposed, resources.size, 'owned VFX resources are each released exactly once')
})

function pointer(target: EventTarget, type: string, x: number, y: number, id = 1, primary = true): void {
  target.dispatchEvent(Object.assign(new Event(type), {
    clientX: x, clientY: y, pointerId: id, isPrimary: primary, button: 0,
  }))
}

test('nested artifact hits activate; unrelated clicks, drag return, multi-touch and canceled gestures do not', () => {
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600 }),
  })
  const activateButton = new EventTarget()
  const resetButton = new EventTarget()
  const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 100)
  camera.position.z = 5
  const artifact = new THREE.Group()
  const nested = new THREE.Group()
  nested.add(new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshBasicMaterial()))
  artifact.add(nested)
  const scene = new THREE.Group()
  scene.add(artifact)
  let activations = 0
  let resets = 0
  const unbind = bindRitualInteraction({
    canvas, camera, artifact, scene, activateButton, resetButton,
    activate: () => { activations++; return true }, reset: () => { resets++ },
  })
  pointer(canvas, 'pointerdown', 500, 350)
  pointer(canvas, 'pointerup', 500, 350)
  assert.equal(activations, 1)
  pointer(canvas, 'pointerdown', 150, 100)
  pointer(canvas, 'pointerup', 150, 100)
  pointer(canvas, 'pointerdown', 500, 350)
  pointer(canvas, 'pointermove', 530, 350)
  pointer(canvas, 'pointermove', 500, 350)
  pointer(canvas, 'pointerup', 500, 350)
  pointer(canvas, 'pointerdown', 500, 350)
  pointer(canvas, 'pointerdown', 510, 350, 2, false)
  pointer(canvas, 'pointerup', 510, 350, 2, false)
  pointer(canvas, 'pointerup', 500, 350)
  pointer(canvas, 'pointerdown', 500, 350)
  pointer(canvas, 'pointercancel', 500, 350)
  pointer(canvas, 'pointerup', 500, 350)
  assert.equal(activations, 1)
  activateButton.dispatchEvent(new Event('click'))
  resetButton.dispatchEvent(new Event('click'))
  assert.equal(activations, 2)
  assert.equal(resets, 1)
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.3), new THREE.MeshBasicMaterial())
  blocker.position.z = 1
  scene.add(blocker)
  pointer(canvas, 'pointerdown', 500, 350)
  pointer(canvas, 'pointerup', 500, 350)
  assert.equal(activations, 2, 'an opaque object in front of the artifact must block activation')
  blocker.visible = false
  pointer(canvas, 'pointerdown', 500, 350)
  pointer(canvas, 'pointerup', 500, 350)
  assert.equal(activations, 3, 'a hidden fallback must not block activation')
  unbind()
  activateButton.dispatchEvent(new Event('click'))
  pointer(canvas, 'pointerdown', 500, 350)
  pointer(canvas, 'pointerup', 500, 350)
  assert.equal(activations, 3)
})
