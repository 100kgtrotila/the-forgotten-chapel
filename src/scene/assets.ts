import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

export interface ModelAsset {
  path: string | null
  height: number
  rotation?: readonly [number, number, number]
  surface?: 'agedStone'
}

// Local glTF files, licenses and dependencies are documented in ASSETS.md.
export const MODEL_ASSETS: Record<'rearArch' | 'ruinedArch' | 'statue' | 'column' | 'gate', ModelAsset> = {
  rearArch: { path: null, height: 6.1 },
  ruinedArch: { path: null, height: 4.1 },
  statue: { path: 'models/lucy_angel/lucy_angel.gltf', height: 1.8, rotation: [0, Math.PI, 0], surface: 'agedStone' },
  gate: { path: 'models/large_iron_gate/large_iron_gate.gltf', height: 3.72 },
  column: { path: null, height: 1.8 },
}

export interface ModelSlot {
  container: THREE.Group
  fallback: THREE.Group
  asset: ModelAsset
}

export function createModelInstance(source: THREE.Group, asset: ModelAsset): THREE.Group {
  const model = clone(source)
  if (asset.rotation) model.rotation.set(...asset.rotation)
  model.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(model)
  const height = bounds.max.y - bounds.min.y
  if (!Number.isFinite(height) || height <= 0 || !Number.isFinite(asset.height) || asset.height <= 0) {
    throw new Error('Model must have finite bounds and a positive target height')
  }

  const center = bounds.getCenter(new THREE.Vector3())
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z))
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
  })

  const instance = new THREE.Group()
  instance.name = 'Imported model'
  instance.scale.setScalar(asset.height / height)
  instance.add(model)
  return instance
}

export async function loadModelSlots(slots: ModelSlot[], signal: AbortSignal): Promise<void> {
  const loader = new GLTFLoader()
  const cache = new Map<string, Promise<THREE.Group>>()
  const sources = new Set<THREE.Group>()
  const usedSources = new Set<THREE.Group>()

  await Promise.all(slots.map(async (slot) => {
    const path = slot.asset.path
    if (!path || signal.aborted) return
    try {
      const key = `${path}:${slot.asset.surface ?? 'original'}`
      let request = cache.get(key)
      if (!request) {
        const url = `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\//, '')}`
        request = loader.loadAsync(url).then((gltf) => {
          if (slot.asset.surface === 'agedStone') {
            gltf.scene.traverse((object) => {
              if (!(object instanceof THREE.Mesh)) return
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (!(material instanceof THREE.MeshStandardMaterial)) continue
                material.color.set('#767b70')
                material.metalness = 0
                // Use a matte surface instead of the asset's locally glossy ARM roughness.
                material.roughnessMap = null
                material.roughness = 0.96
                material.normalScale.setScalar(0.55)
              }
            })
          }
          sources.add(gltf.scene)
          return gltf.scene
        })
        cache.set(key, request)
      }
      const source = await request
      if (signal.aborted) return
      const instance = createModelInstance(source, slot.asset)
      slot.container.add(instance)
      slot.fallback.visible = false
      usedSources.add(source)
    } catch (error) {
      if (!signal.aborted) console.warn(`Keeping procedural fallback for ${path}`, error)
    }
  }))

  for (const source of sources) {
    if (signal.aborted || !usedSources.has(source)) disposeObjectResources(source)
  }
}

export function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (object instanceof THREE.InstancedMesh) object.dispose()
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
    }
  })
  for (const material of materials) {
    const properties: unknown[] = Object.values(material)
    for (const property of properties) {
      if (property instanceof THREE.Texture) textures.add(property)
    }
  }
  textures.forEach((texture) => texture.dispose())
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}
