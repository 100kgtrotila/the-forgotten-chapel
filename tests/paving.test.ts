import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createPaving } from '../src/scene/createPaving.ts'

test('instanced paving preserves placement bounds used by platform colliders', () => {
  const geometry = new THREE.BoxGeometry(2, 0.16, 2)
  const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]
  const tiles = [{ position: [-2, 1.25, -3], angle: 0, materialIndex: 0 },
    { position: [2, 1.25, 3], angle: 0, materialIndex: 1 }] as const
  const meshes = createPaving(geometry, materials, [...tiles], true)
  const group = new THREE.Group()
  group.add(...meshes)
  const bounds = new THREE.Box3().setFromObject(group)
  assert.equal(meshes.length, 2)
  assert.equal(meshes.reduce((count, mesh) => count + mesh.count, 0), 2)
  assert.ok(Math.abs(bounds.max.y - 1.33) < 1e-6)
  assert.equal(bounds.min.x, -3)
  assert.equal(bounds.max.z, 4)
  assert.ok(meshes.every((mesh) => mesh.castShadow && mesh.receiveShadow))
})
