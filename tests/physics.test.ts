import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { PhysicsWorld } from '../src/physics/PhysicsWorld.ts'

const ground = { center: [0, -0.1, 0], halfExtents: [8, 0.1, 8] } as const

function stone(x: number, y: number) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15), new THREE.MeshStandardMaterial())
  mesh.position.set(x, y, 0)
  return { mesh, radius: 0.15 }
}

test('Rapier gravity drops stones and ground collision lets them settle', async (context) => {
  const physics = await PhysicsWorld.create([ground])
  context.after(() => physics.dispose())
  const item = stone(0, 4)
  physics.release([item])
  for (let i = 0; i < 15; i++) physics.step(1 / 60)
  assert.ok(item.mesh.position.y < 3.9 && item.mesh.position.y > 0.2)
  for (let i = 0; i < 600; i++) physics.step(1 / 60)
  assert.ok(item.mesh.position.y >= 0.13 && item.mesh.position.y <= 0.18)
  assert.ok(item.mesh.quaternion.angleTo(new THREE.Quaternion()) > 0.01)
})

test('altar collider catches a stone above the ground', async (context) => {
  const physics = await PhysicsWorld.create([ground, { center: [0, 2.5, 0], halfExtents: [1.5, 0.25, 0.85] }])
  context.after(() => physics.dispose())
  const item = stone(0, 4)
  physics.release([item])
  for (let i = 0; i < 400; i++) physics.step(1 / 60)
  assert.ok(item.mesh.position.y > 2.87 && item.mesh.position.y < 2.93)
})

test('reset removes dynamic bodies and colliders across repeated releases', async (context) => {
  const physics = await PhysicsWorld.create([ground])
  context.after(() => physics.dispose())
  const items = [stone(-0.5, 3), stone(0.5, 3)]
  for (let cycle = 0; cycle < 12; cycle++) {
    physics.release(items)
    physics.release(items)
    assert.equal(physics.bodyCount, 2)
    assert.equal(physics.colliderCount, 3)
    physics.step(1 / 60)
    physics.reset()
    assert.equal(physics.bodyCount, 0)
    assert.equal(physics.colliderCount, 1)
  }
})

test('a long frame advances only the bounded number of fixed physics steps', async (context) => {
  const physics = await PhysicsWorld.create([ground])
  context.after(() => physics.dispose())
  const item = stone(0, 4)
  physics.release([item])
  physics.step(30)
  assert.ok(item.mesh.position.y > 3.9 && item.mesh.position.y < 4)
})

test('disposed physics ignores stale release, update and reset calls safely', async () => {
  const physics = await PhysicsWorld.create([ground])
  const item = stone(0, 4)
  physics.release([item])
  physics.dispose()
  const position = item.mesh.position.clone()
  assert.doesNotThrow(() => {
    physics.release([item])
    physics.step(1 / 60)
    physics.reset()
    physics.dispose()
  })
  assert.equal(physics.bodyCount, 0)
  assert.equal(physics.colliderCount, 0)
  assert.ok(item.mesh.position.equals(position))
})
