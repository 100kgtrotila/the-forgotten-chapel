import assert from 'node:assert/strict'
import test from 'node:test'
import type { TestContext } from 'node:test'
import * as THREE from 'three'
import { FrameClock } from '../src/core/FrameClock.ts'
import { RitualController } from '../src/interaction/RitualController.ts'
import { PhysicsWorld } from '../src/physics/PhysicsWorld.ts'

class Visibility extends EventTarget {
  hidden = false
  setHidden(hidden: boolean): void {
    this.hidden = hidden
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

async function fixture(context: TestContext) {
  const visibility = new Visibility()
  const events = new AbortController()
  const clock = new FrameClock(visibility, events.signal)
  const physics = await PhysicsWorld.create([{ center: [0, -0.1, 0], halfExtents: [20, 0.1, 20] }])
  const artifact = new THREE.Group()
  artifact.position.y = 3.68
  const material = new THREE.MeshStandardMaterial()
  const ritual = new RitualController({ artifact, stoneMaterial: material, physics, seal: { update() {} } })
  const release = context.mock.method(physics, 'release')
  const step = context.mock.method(physics, 'step')
  const tick = (timestamp: number) => {
    clock.update(timestamp)
    ritual.update(clock.visualDelta, true, clock.physicsDelta)
  }
  context.after(() => {
    events.abort()
    ritual.dispose()
    const stone = ritual.group.children[0]
    if (stone instanceof THREE.Mesh) stone.geometry.dispose()
    material.dispose()
  })
  tick(0)
  return { visibility, events, clock, physics, artifact, ritual, release, step, tick }
}

for (const fps of [10, 30, 60, 144]) {
  test(`foreground activation lasts 3.2 seconds within one frame at ${fps} FPS`, async (context) => {
    const f = await fixture(context)
    f.ritual.activate()
    let frame = 0
    while (f.ritual.state === 'activating' && frame < fps * 4) f.tick(++frame * 1000 / fps)
    const seconds = frame / fps
    assert.equal(f.ritual.state, 'released')
    assert.ok(seconds >= 3.2 - 1e-9 && seconds <= 3.2 + 1 / fps + 1e-9, `${seconds} seconds`)
    assert.equal(f.release.mock.callCount(), 1)
    assert.equal(f.physics.bodyCount, 8)
    assert.ok(f.step.mock.calls.every((call) => call.arguments[0] <= 0.05))
    f.tick((frame + 1) * 1000 / fps)
    assert.equal(f.release.mock.callCount(), 1)
    context.diagnostic(`${fps} FPS: ${seconds.toFixed(6)} s, ${frame} frames`)
  })
}

test('a long foreground stall completes charging but cannot create a physics backlog', async (context) => {
  const f = await fixture(context)
  f.ritual.activate()
  f.tick(1000)
  assert.equal(f.ritual.state, 'activating')
  assert.equal(f.physics.bodyCount, 0)
  f.tick(11000)
  assert.equal(f.clock.visualDelta, 10)
  assert.equal(f.clock.physicsDelta, 0.05)
  assert.equal(f.ritual.state, 'released')
  assert.equal(f.release.mock.callCount(), 1)
  assert.equal(f.step.mock.calls.at(-1)?.arguments[0], 0.05)
  assert.equal(f.ritual.effects.group.getObjectByName('Rising ritual embers')?.visible, false,
    'a completed burst must not flash again on the first frame after a long foreground stall')
  const before = f.ritual.group.children.map((mesh) => mesh.position.clone())
  f.tick(11000)
  assert.deepEqual(f.ritual.group.children.map((mesh) => mesh.position.toArray()), before.map((p) => p.toArray()))
})

test('visibility changes pause progress with or without hidden frames and do not reset the ritual', async (context) => {
  const f = await fixture(context)
  f.ritual.activate()
  f.tick(1000)
  const position = f.artifact.position.clone()
  f.visibility.setHidden(true)
  f.tick(60000)
  assert.equal(f.clock.visualDelta, 0)
  assert.equal(f.clock.physicsDelta, 0)
  assert.ok(f.artifact.position.equals(position))
  assert.equal(f.ritual.state, 'activating')
  f.visibility.setHidden(false)
  f.tick(120000)
  assert.equal(f.clock.visualDelta, 0)
  f.tick(121000)
  assert.equal(f.ritual.state, 'activating')
  f.visibility.setHidden(true)
  f.visibility.setHidden(false) // A browser may produce no frames at all while hidden.
  f.tick(240000)
  assert.equal(f.clock.visualDelta, 0)
  f.tick(241199)
  assert.equal(f.ritual.state, 'activating')
  f.tick(241201)
  assert.equal(f.ritual.state, 'released')
  assert.equal(f.release.mock.callCount(), 1)
})

test('release hands animated transforms to Rapier without a pre-release physics jump', async (context) => {
  const f = await fixture(context)
  f.ritual.activate()
  f.tick(3100)
  const originalRelease = PhysicsWorld.prototype.release.bind(f.physics)
  let transferred: number[][] = []
  f.release.mock.mockImplementation((stones) => {
    transferred = stones.map((stone) => stone.mesh.position.toArray())
    originalRelease(stones)
  })
  f.tick(3200)
  assert.equal(f.ritual.state, 'released')
  assert.ok(f.step.mock.calls.at(-1)?.arguments[0] < 1e-9)
  for (const [index, mesh] of f.ritual.group.children.entries()) {
    assert.ok(mesh.position.distanceTo(new THREE.Vector3(...transferred[index])) < 1e-6)
  }
  f.tick(3217)
  assert.equal(f.physics.bodyCount, 8)
  assert.ok(f.ritual.group.children[0].position.y > transferred[0][1])
})

test('reset cancels activation, resets immediately after release and supports repeated cycles', async (context) => {
  const f = await fixture(context)
  const initial = f.ritual.group.children.map((mesh) => mesh.position.toArray())
  f.ritual.activate()
  f.tick(1000)
  f.ritual.reset()
  f.tick(8000)
  assert.equal(f.release.mock.callCount(), 0)
  for (let cycle = 0; cycle < 10; cycle++) {
    f.ritual.activate()
    f.tick(8000 + (cycle + 1) * 3201)
    assert.equal(f.release.mock.callCount(), cycle + 1)
    assert.equal(f.physics.bodyCount, 8)
    assert.equal(f.physics.colliderCount, 9)
    f.ritual.reset()
    assert.equal(f.physics.bodyCount, 0)
    assert.equal(f.physics.colliderCount, 1)
    assert.deepEqual(f.ritual.group.children.map((mesh) => mesh.position.toArray()), initial)
  }
})

test('aborting the owning lifecycle removes the visibility listener', () => {
  const visibility = new Visibility()
  const events = new AbortController()
  const clock = new FrameClock(visibility, events.signal)
  clock.update(0)
  events.abort()
  visibility.setHidden(true)
  visibility.setHidden(false)
  clock.update(100)
  assert.equal(clock.visualDelta, 0.1, 'the detached listener must not reset the clock')
})
