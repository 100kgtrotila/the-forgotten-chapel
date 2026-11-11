import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createArchitecture } from '../src/scene/createArchitecture.ts'
import { createChapelMaterials } from '../src/scene/materials.ts'
import { disposeObjectResources } from '../src/scene/assets.ts'
import { PhysicsWorld } from '../src/physics/PhysicsWorld.ts'

test('fallen stones collide with the closed rear gate from both sides across resets', async (context) => {
  const deckHeight = 1.33
  const setup = createChapelMaterials(new AbortController().signal, { stone: {}, floor: {}, metal: {} })
  await setup.ready
  const architecture = createArchitecture(setup.materials, deckHeight)
  context.after(() => disposeObjectResources(architecture.group))
  const gateSlot = architecture.modelSlots.find((slot) => slot.container.name === 'Rear chapel gate')
  assert.ok(gateSlot)
  const gate = architecture.colliders.find((collider) => collider.center[2] === gateSlot.container.position.z)
  assert.ok(gate, 'the visible gate needs a physical collision surface')
  const physics = await PhysicsWorld.create([
    { center: [0, deckHeight - 0.1, 0], halfExtents: [8, 0.1, 8] },
    ...architecture.colliders,
  ])
  context.after(() => physics.dispose())
  for (const side of [1, -1, 1]) {
    const stones = [-1.4, 0, 1.4].map((x) => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15), setup.materials.oldStone)
      mesh.position.set(x, deckHeight + 0.16, gate.center[2] + side)
      context.after(() => mesh.geometry.dispose())
      return { mesh, radius: 0.15, velocity: [0, 0, -side * 4] }
    })
    physics.release(stones)
    for (let frame = 0; frame < 360; frame++) {
      physics.step(1 / 60)
      for (const stone of stones) {
        assert.ok(side * (stone.mesh.position.z - gate.center[2]) >= gate.halfExtents[2] + stone.radius - 0.02,
          'a rolling stone must remain on its original side of the gate')
      }
    }
    assert.ok(stones.some((stone) => Math.abs(stone.mesh.position.z - gate.center[2]) < 0.5),
      'the stones must reach the gate to exercise the collision')
    physics.reset()
    assert.equal(physics.bodyCount, 0)
    assert.equal(physics.colliderCount, 1 + architecture.colliders.length)
  }
})
