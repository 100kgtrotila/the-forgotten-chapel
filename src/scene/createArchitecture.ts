import * as THREE from 'three'
import { MODEL_ASSETS } from './assets.ts'
import type { ModelAsset, ModelSlot } from './assets'
import type { ChapelMaterials } from './materials'
import type { StaticCollider } from '../physics/PhysicsWorld'

export function createArchitecture(materials: ChapelMaterials, deckHeight: number): {
  group: THREE.Group
  modelSlots: ModelSlot[]
  candleSupports: THREE.Vector3[]
  colliders: StaticCollider[]
} {
  const group = new THREE.Group()
  group.name = 'Ruined chapel architecture'
  const modelSlots: ModelSlot[] = []
  const candleSupports: THREE.Vector3[] = []
  const blockGeometry = new THREE.BoxGeometry(1, 1, 1)

  function block(
    parent: THREE.Group,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.Material = materials.oldStone,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(blockGeometry, material)
    mesh.scale.set(...size)
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  function slot(name: string, asset: ModelAsset, position: readonly [number, number, number], rotation = 0): THREE.Group {
    const container = new THREE.Group()
    container.name = name
    container.position.set(...position)
    container.rotation.y = rotation
    const fallback = new THREE.Group()
    fallback.name = `${name} procedural fallback`
    container.add(fallback)
    group.add(container)
    modelSlots.push({ container, fallback, asset })
    return fallback
  }

  function arch(radius: number, height: number, thickness: number, broken = false): THREE.ExtrudeGeometry {
    const profile = new THREE.Shape()
    profile.moveTo(-radius, 0)
    profile.quadraticCurveTo(-radius, height * 0.55, 0, height)
    if (!broken) {
      profile.quadraticCurveTo(radius, height * 0.55, radius, 0)
      profile.lineTo(radius - thickness, 0)
      profile.quadraticCurveTo(radius - thickness, height * 0.5, 0, height - thickness * 1.3)
    } else {
      profile.lineTo(0, height - thickness * 1.3)
    }
    profile.quadraticCurveTo(-radius + thickness, height * 0.5, -radius + thickness, 0)
    profile.closePath()
    const geometry = new THREE.ExtrudeGeometry(profile, {
      depth: 0.56, bevelEnabled: true, bevelSize: 0.035,
      bevelThickness: 0.035, bevelSegments: 1, curveSegments: 16, steps: 1,
    })
    geometry.translate(0, 0, -0.28)
    return geometry
  }

  function pier(parent: THREE.Group, x: number, height: number): void {
    block(parent, [0.94, 0.2, 0.98], [x, 0.1, 0], materials.carvedStone)
    const courses = Math.max(2, Math.round((height - 0.4) / 0.42))
    const courseHeight = (height - 0.4) / courses
    for (let course = 0; course < courses; course++) {
      block(parent, [0.66, courseHeight - 0.018, 0.72], [x, 0.2 + (course + 0.5) * courseHeight, 0],
        materials.stoneVariants[course % materials.stoneVariants.length])
    }
    block(parent, [0.84, 0.2, 0.88], [x, height - 0.1, 0], materials.carvedStone)
    const mouldingGeometry = new THREE.CylinderGeometry(0.075, 0.09, height - 0.45, 8)
    for (const offset of [-0.23, 0.23]) {
      const moulding = new THREE.Mesh(mouldingGeometry, materials.carvedStone)
      moulding.position.set(x + offset, height / 2, 0.38)
      moulding.castShadow = true
      moulding.receiveShadow = true
      parent.add(moulding)
    }
  }

  const rearZ = -3.72
  const thresholdHeight = 0.2
  const rear = slot('Rear pointed arch', MODEL_ASSETS.rearArch, [0, deckHeight, rearZ])
  const threshold = block(group, [3.5, thresholdHeight, 0.8], [0, deckHeight + thresholdHeight / 2, rearZ], materials.carvedStone)
  threshold.name = 'Rear gate threshold'
  slot('Rear chapel gate', MODEL_ASSETS.gate, [0, deckHeight + thresholdHeight, rearZ])
  // The normalized gate is about 3.75 units wide. A solid proxy covers its bars
  // and the gap below the raised model, so rolling fragments cannot pass under it.
  const gateHalfHeight = (MODEL_ASSETS.gate.height + thresholdHeight) / 2
  const colliders: StaticCollider[] = [{
    center: [0, deckHeight + gateHalfHeight, rearZ],
    halfExtents: [3.75 / 2, gateHalfHeight, 0.12 / 2],
  }]
  pier(rear, -2.22, 3.15)
  pier(rear, 2.22, 3.15)
  const rearArch = new THREE.Mesh(arch(2.36, 2.85, 0.28), materials.oldStone)
  rearArch.position.y = 3.15
  rearArch.castShadow = true
  rearArch.receiveShadow = true
  rear.add(rearArch)

  const side = slot('Broken western arch', MODEL_ASSETS.ruinedArch, [-5.75, 0, -0.8], 0.45)
  pier(side, -1.3, 2.3)
  pier(side, 1.3, 0.95)
  const brokenArch = new THREE.Mesh(arch(1.44, 2.02, 0.27, true), materials.oldStone)
  brokenArch.position.y = 2.3
  brokenArch.castShadow = true
  brokenArch.receiveShadow = true
  side.add(brokenArch)

  for (const [x, height] of [[-4.25, 1.5], [4.25, 1.85]]) {
    const column = slot('Broken foreground column', { ...MODEL_ASSETS.column, height }, [x, deckHeight, 1.45])
    block(column, [1.02, 0.22, 1.02], [0, 0.11, 0], materials.carvedStone)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, height - 0.3, 10), materials.oldStone)
    shaft.position.y = 0.22 + (height - 0.3) / 2
    shaft.castShadow = true
    shaft.receiveShadow = true
    column.add(shaft)
    const cap = block(column, [0.58, 0.12, 0.6], [0, height - 0.02, 0], materials.stoneVariants[1])
    cap.name = 'Candle pedestal cap'
    cap.updateWorldMatrix(true, false)
    const capBounds = new THREE.Box3().setFromObject(cap)
    const support = capBounds.getCenter(new THREE.Vector3())
    support.y = capBounds.max.y
    candleSupports.push(support)
  }

  const robeGeometry = new THREE.CylinderGeometry(0.17, 0.38, 1.03, 10)
  const headGeometry = new THREE.SphereGeometry(0.18, 10, 10)
  const armGeometry = new THREE.CylinderGeometry(0.09, 0.13, 0.53, 8)
  for (const side of [-1, 1]) {
    const x = side * 3.65
    const z = -2.8
    block(group, [1.12, 0.18, 1.12], [x, deckHeight + 0.09, z], materials.oldStone)
    block(group, [0.85, 0.42, 0.85], [x, deckHeight + 0.39, z], materials.darkStone)
    block(group, [1.0, 0.12, 1.0], [x, deckHeight + 0.66, z], materials.carvedStone)
    const statue = slot('Stone guardian angel', MODEL_ASSETS.statue, [x, deckHeight + 0.72, z], -side * 0.3)
    const robe = new THREE.Mesh(robeGeometry, materials.oldStone)
    robe.position.y = 0.515
    const head = new THREE.Mesh(headGeometry, materials.carvedStone)
    head.position.set(0, 1.25, 0)
    head.scale.set(1, 1.15, 1)
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10, 0, Math.PI), materials.oldStone)
    hood.position.set(0, 1.24, -0.04)
    hood.rotation.y = Math.PI
    for (const armSide of [-1, 1]) {
      const arm = new THREE.Mesh(armGeometry, materials.oldStone)
      arm.position.set(armSide * 0.2, 0.91, 0.15)
      arm.rotation.z = armSide * 0.6
      arm.castShadow = true
      statue.add(arm)
    }
    block(statue, [0.28, 0.4, 0.1], [0, 0.78, 0.27], materials.carvedStone)
    for (const part of [robe, head, hood]) {
      part.castShadow = true
      part.receiveShadow = true
      statue.add(part)
    }
  }

  for (const side of [-1, 1]) {
    for (let row = 0; row < 6; row++) {
      for (let column = 0; column < 2; column++) {
        if (row > 3 && column === 1) continue
        const x = side * (3.2 + column * 1.05) + (row % 2) * 0.06
        const masonry = block(group, [1.02, 0.43, 0.66], [x, deckHeight + 0.215 + row * 0.45, rearZ],
          materials.stoneVariants[(row + column) % materials.stoneVariants.length])
        if (row === 5) masonry.rotation.z = side * 0.035
      }
    }
  }

  return { group, modelSlots, candleSupports, colliders }
}
