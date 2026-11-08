import * as THREE from 'three'
import { createArchitecture } from './createArchitecture'
import type { ModelSlot } from './assets'
import type { ChapelMaterials } from './materials'
import type { StaticCollider } from '../physics/PhysicsWorld'
import { createPaving } from './createPaving'
import type { PavingTile } from './createPaving'

export interface ChapelScene {
  group: THREE.Group
  artifact: THREE.Group
  candlePositions: THREE.Vector3[]
  modelSlots: ModelSlot[]
  colliders: StaticCollider[]
  altarSurface: THREE.Vector3
}

export function createChapel(materials: ChapelMaterials): ChapelScene {
  const group = new THREE.Group()
  const { darkStone, oldStone, carvedStone, metal, wax, flame, magic } = materials
  const deckHeight = 1.33

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 24), materials.earth)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.045
  floor.receiveShadow = true
  group.add(floor)

  const pavingGeometry = new THREE.BoxGeometry(1.34, 0.12, 1.34)
  const groundTiles: PavingTile[] = []
  for (let row = 0; row < 10; row++) {
    for (let column = 0; column < 11; column++) {
      const x = (column - 5) * 1.39
      const z = (row - 4) * 1.39
      if (Math.abs(x) < 5.4 && z < 3.8 && z > -4.6) continue
      groundTiles.push({ position: [x, -0.02 + Math.sin(row * 5 + column * 7) * 0.01, z],
        angle: Math.sin(row + column * 5) * 0.018, materialIndex: (row * 3 + column) % materials.floorVariants.length })
    }
  }
  group.add(...createPaving(pavingGeometry, materials.floorVariants, groundTiles, false))

  const platform = new THREE.Mesh(new THREE.BoxGeometry(9.8, 1.15, 7.8), darkStone)
  const platformMeshes: THREE.Mesh[] = [platform]
  const stairs: THREE.Mesh[] = []
  const altarSections: THREE.Mesh[] = []
  platform.position.set(0, 0.575, -0.45)
  platform.castShadow = true
  platform.receiveShadow = true
  group.add(platform)

  const platformTileGeometry = new THREE.BoxGeometry(1.985, 0.16, 1.985)
  const deckTiles: PavingTile[] = []
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 5; column++) {
      deckTiles.push({ position: [(column - 2) * 2.01, deckHeight - 0.08, -3.46 + row * 2.01],
        angle: 0, materialIndex: (row + column) % materials.floorVariants.length })
    }
  }
  const deck = createPaving(platformTileGeometry, materials.floorVariants, deckTiles, true)
  group.add(...deck)
  platformMeshes.push(...deck)

  for (let step = 0; step < 4; step++) {
    const height = 1.08 - step * 0.27
    const stair = new THREE.Mesh(new THREE.BoxGeometry(3.85, height, 0.78), oldStone)
    stair.position.set(0, height / 2, 3.72 + step * 0.68)
    stair.castShadow = true
    stair.receiveShadow = true
    group.add(stair)
    stairs.push(stair)
  }

  const altar = new THREE.Group()
  altar.position.set(0, deckHeight, -0.85)
  for (const [width, height, depth, y, material] of [
    [2.75, 0.2, 1.55, 0.1, oldStone],
    [2.14, 1.04, 1.1, 0.72, darkStone],
    [3.05, 0.23, 1.75, 1.35, carvedStone],
  ] as const) {
    const section = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    section.position.y = y
    section.castShadow = true
    section.receiveShadow = true
    altar.add(section)
    altarSections.push(section)
  }
  group.add(altar)
  const architecture = createArchitecture(materials, deckHeight)
  group.add(architecture.group)

  const fallenShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.39, 2.2, 10), oldStone)
  fallenShaft.position.set(6.35, 0.45, -3.55)
  fallenShaft.rotation.set(0.18, 0.45, Math.PI * 0.39)
  fallenShaft.castShadow = true
  fallenShaft.receiveShadow = true
  group.add(fallenShaft)

  const holderBase = new THREE.CylinderGeometry(0.18, 0.21, 0.1, 10)
  const holderStem = new THREE.CylinderGeometry(0.055, 0.07, 0.14, 8)
  const holderCup = new THREE.CylinderGeometry(0.18, 0.12, 0.07, 10)
  const candleBody = new THREE.CylinderGeometry(0.095, 0.1, 0.31, 10)
  const flameGeometry = new THREE.SphereGeometry(0.085, 8, 8)
  const candlePositions: THREE.Vector3[] = []
  for (const { x, y, z } of architecture.candleSupports) {
    const holder = new THREE.Group()
    holder.name = 'Pedestal candle'
    holder.position.set(x, y, z)
    const base = new THREE.Mesh(holderBase, metal)
    base.position.y = 0.05
    const stem = new THREE.Mesh(holderStem, metal)
    stem.position.y = 0.17
    const cup = new THREE.Mesh(holderCup, metal)
    cup.position.y = 0.25
    const candle = new THREE.Mesh(candleBody, wax)
    candle.position.y = 0.44
    const glow = new THREE.Mesh(flameGeometry, flame)
    glow.scale.set(0.65, 1.5, 0.65)
    glow.position.y = 0.69
    for (const part of [base, stem, cup, candle]) {
      part.castShadow = true
      holder.add(part)
    }
    holder.add(glow)
    group.add(holder)
    candlePositions.push(new THREE.Vector3(x, y + 0.74, z))
  }

  const artifact = new THREE.Group()
  artifact.position.set(0, 3.68, -0.85)
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), magic)
  crystal.castShadow = true
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.025, 6, 32), metal)
  innerRing.rotation.x = Math.PI / 2.6
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.018, 6, 32), magic)
  outerRing.rotation.y = Math.PI / 2.5
  artifact.add(crystal, innerRing, outerRing)
  group.add(artifact)

  const debrisGeometry = new THREE.BoxGeometry(1, 1, 1)
  for (const [x, z, width, angle] of [
    [-7.2, -4.4, 0.8, 0.3], [-8.3, 1.4, 0.55, -0.5],
    [-6.9, 4.8, 0.7, 0.6], [-4.8, 6.5, 0.45, 0.2],
    [6.2, -5.4, 0.75, -0.35], [7.5, -2.1, 0.5, 0.4],
    [7.1, 3.1, 0.65, -0.25], [5.8, 5.7, 0.4, 0.7],
  ]) {
    const stone = new THREE.Mesh(debrisGeometry, materials.stoneVariants[Math.floor(Math.abs(x)) % materials.stoneVariants.length])
    stone.scale.set(width, width * 0.42, width * 0.8)
    stone.position.set(x, width * 0.18, z)
    stone.rotation.y = angle
    stone.castShadow = true
    stone.receiveShadow = true
    group.add(stone)
  }

  // Only surfaces involved in the ritual receive physics colliders, not the imported architecture.
  group.updateMatrixWorld(true)
  const colliderFor = (meshes: THREE.Mesh[]): StaticCollider => {
    const bounds = new THREE.Box3()
    for (const mesh of meshes) bounds.union(new THREE.Box3().setFromObject(mesh))
    const center = bounds.getCenter(new THREE.Vector3())
    const halfExtents = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5)
    return { center: [center.x, center.y, center.z], halfExtents: [halfExtents.x, halfExtents.y, halfExtents.z] }
  }
  const colliders: StaticCollider[] = [
    { center: [0, floor.position.y - 0.1, 0], halfExtents: [13, 0.1, 12] },
    colliderFor(platformMeshes),
    ...stairs.map((mesh) => colliderFor([mesh])),
    ...altarSections.map((mesh) => colliderFor([mesh])),
  ]
  const altarBounds = new THREE.Box3().setFromObject(altar)
  const altarSurface = altarBounds.getCenter(new THREE.Vector3())
  altarSurface.y = altarBounds.max.y + 0.012
  return { group, artifact, candlePositions, modelSlots: architecture.modelSlots, colliders, altarSurface }
}
