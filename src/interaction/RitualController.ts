import * as THREE from 'three'
import type { MagicSeal } from '../effects/MagicSeal'
import type { PhysicsStone, PhysicsWorld } from '../physics/PhysicsWorld'
import { RitualEffects } from '../effects/RitualEffects.ts'

export type RitualState = 'idle' | 'activating' | 'released'
const ACTIVATION_DURATION = 3.2
const STONE_COUNT = 8

interface RitualOptions {
  artifact: THREE.Group
  stoneMaterial: THREE.Material
  seal: Pick<MagicSeal, 'update'>
  physics: PhysicsWorld
  onStateChange?: (state: RitualState) => void
}

export class RitualController {
  readonly group = new THREE.Group()
  readonly effects: RitualEffects
  private readonly options: RitualOptions
  private readonly basePosition: THREE.Vector3
  private readonly baseRotation: THREE.Euler
  private readonly baseScale: THREE.Vector3
  private readonly emissiveMaterials: Array<{ material: THREE.MeshStandardMaterial; intensity: number }> = []
  private readonly stones: PhysicsStone[] = []
  private currentState: RitualState = 'idle'
  private elapsed = 0
  private transitionTime = 0
  private effectTime = 0
  private orbitAngle = 0
  private readonly stoneGeometry = new THREE.IcosahedronGeometry(0.14, 0)
  private disposed = false

  constructor(options: RitualOptions) {
    this.options = options
    this.basePosition = options.artifact.position.clone()
    this.baseRotation = options.artifact.rotation.clone()
    this.baseScale = options.artifact.scale.clone()
    this.effects = new RitualEffects(this.basePosition)
    this.group.name = 'Ritual stones'
    for (let index = 0; index < STONE_COUNT; index++) {
      const mesh = new THREE.Mesh(this.stoneGeometry, options.stoneMaterial)
      mesh.name = `Ritual stone ${index + 1}`
      const scale = 0.86 + (index % 3) * 0.12
      mesh.scale.setScalar(scale)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.group.add(mesh)
      const angle = (index + 0.5) / STONE_COUNT * Math.PI * 2
      this.stones.push({ mesh, radius: 0.14 * scale, velocity: [Math.cos(angle) * 0.5, 0.05, Math.sin(angle) * 0.5] })
    }
    const materials = new Set<THREE.MeshStandardMaterial>()
    options.artifact.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial) materials.add(material)
      }
    })
    for (const material of materials) this.emissiveMaterials.push({ material, intensity: material.emissiveIntensity })
    this.update(0)
    options.onStateChange?.('idle')
  }

  get state(): RitualState { return this.currentState }

  activate(): boolean {
    if (this.disposed || this.currentState !== 'idle') return false
    this.currentState = 'activating'
    this.transitionTime = 0
    this.options.onStateChange?.(this.currentState)
    return true
  }

  update(visualDelta: number, motion = true, physicsDelta = visualDelta): void {
    if (this.disposed || !Number.isFinite(visualDelta) || visualDelta < 0) return
    this.elapsed += visualDelta
    if (this.currentState !== 'idle') this.transitionTime += visualDelta
    const progress = Math.min(this.transitionTime / ACTIVATION_DURATION, 1)
    const smooth = progress * progress * (3 - 2 * progress)
    const charge = this.currentState === 'activating' ? smooth : 0
    if (motion) this.orbitAngle += visualDelta * (0.1 + charge * 3.8)

    if (this.currentState !== 'released') {
      for (let index = 0; index < this.stones.length; index++) {
        const stone = this.stones[index]
        const angle = (index + 0.5) / STONE_COUNT * Math.PI * 2 + (motion ? this.orbitAngle : 0)
        const radius = THREE.MathUtils.lerp(0.99, 0.48, charge)
        stone.mesh.position.set(
          this.basePosition.x + Math.cos(angle) * radius,
          this.basePosition.y + 0.35 + charge * 0.6 + (motion ? Math.sin(this.elapsed * 1.1 + index) * 0.075 : 0),
          this.basePosition.z + Math.sin(angle) * THREE.MathUtils.lerp(0.63, 0.48, charge),
        )
        stone.mesh.rotation.set(index * 0.3, index * 0.7 + (motion ? this.elapsed * 0.18 : 0), index * 0.2)
      }
    }

    let releasedThisFrame = false
    if (this.currentState === 'activating' && this.transitionTime >= ACTIVATION_DURATION) {
      for (const [index, stone] of this.stones.entries()) {
        const x = stone.mesh.position.x - this.basePosition.x
        const z = stone.mesh.position.z - this.basePosition.z
        const radius = Math.hypot(x, z)
        stone.velocity = [x / radius * 1.65, 1.7 + index % 3 * 0.2, z / radius * 1.65]
      }
      this.options.physics.release(this.stones)
      this.currentState = 'released'
      this.transitionTime -= ACTIVATION_DURATION
      releasedThisFrame = true
      this.options.onStateChange?.(this.currentState)
    }
    if (this.currentState === 'released') {
      // Only the part of this frame after release belongs to the simulation.
      this.options.physics.step(releasedThisFrame ? Math.min(physicsDelta, this.transitionTime) : physicsDelta)
    }

    const activation = this.currentState === 'activating' ? smooth
      : this.currentState === 'released' ? 0.18 + 0.82 * Math.exp(-this.transitionTime * 2) : 0
    const pulse = this.currentState === 'activating' ? Math.sin(progress * Math.PI) : 0
    if (motion) this.effectTime += visualDelta * (1 + activation * 3)
    this.options.seal.update(motion ? this.effectTime : 0, 0.85 + activation * 3, activation)
    this.effects.update(this.effectTime, this.currentState === 'activating' ? charge : 0,
      this.currentState === 'released' ? this.transitionTime : -1, motion)

    const artifact = this.options.artifact
    artifact.position.copy(this.basePosition)
    artifact.position.y += motion ? Math.sin(this.elapsed * 0.9) * 0.13 : 0
    artifact.position.y += this.currentState === 'released' ? 0.2 + 0.3 * Math.exp(-this.transitionTime * 1.5) : charge * 0.5
    artifact.rotation.copy(this.baseRotation)
    artifact.rotation.y += motion ? this.elapsed * 0.32 + this.orbitAngle * 0.3 : 0
    artifact.scale.copy(this.baseScale).multiplyScalar(1 + (motion ? pulse * 0.13 + activation * 0.08 : 0))
    for (const { material, intensity } of this.emissiveMaterials) {
      material.emissiveIntensity = intensity * (1 + (motion ? Math.sin(this.elapsed * 1.2) * 0.05 + activation * 1.8 : 0))
    }
  }

  reset(): void {
    if (this.disposed) return
    this.options.physics.reset()
    this.currentState = 'idle'
    this.elapsed = 0
    this.transitionTime = 0
    this.effectTime = 0
    this.orbitAngle = 0
    this.update(0)
    this.options.onStateChange?.(this.currentState)
  }

  dispose(): void {
    if (this.disposed) return
    this.options.physics.dispose()
    this.effects.dispose()
    this.group.removeFromParent()
    this.stoneGeometry.dispose()
    this.disposed = true
  }
}

interface InteractionOptions {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  artifact: THREE.Object3D
  scene: THREE.Object3D
  activateButton: HTMLButtonElement
  resetButton: HTMLButtonElement
  activate: () => boolean
  reset: () => void
}

export function bindRitualInteraction(options: InteractionOptions): () => void {
  const listeners = new AbortController()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const hits: THREE.Intersection[] = []
  const pointers = new Set<number>()
  let candidate: { id: number; x: number; y: number; moved: boolean } | null = null
  const isVisible = (object: THREE.Object3D): boolean => {
    let ancestor: THREE.Object3D | null = object
    while (ancestor) {
      if (!ancestor.visible) return false
      ancestor = ancestor.parent
    }
    return true
  }

  try {
    options.canvas.addEventListener('pointerdown', (event) => {
      pointers.add(event.pointerId)
      candidate = pointers.size === 1 && event.isPrimary && event.button === 0
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null
    }, { signal: listeners.signal })

    options.canvas.addEventListener('pointermove', (event) => {
      if (!candidate || candidate.id !== event.pointerId) return
      if (Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 6) candidate.moved = true
    }, { signal: listeners.signal })

    options.canvas.addEventListener('pointercancel', (event) => {
      pointers.delete(event.pointerId)
      candidate = null
    }, { signal: listeners.signal })

    options.canvas.addEventListener('pointerup', (event) => {
      pointers.delete(event.pointerId)
      const gesture = candidate
      candidate = null
      if (!gesture || gesture.id !== event.pointerId || gesture.moved || pointers.size > 0
        || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) return
      const bounds = options.canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0 || event.clientX < bounds.left || event.clientY < bounds.top
        || event.clientX > bounds.left + bounds.width || event.clientY > bounds.top + bounds.height) return
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1)
      options.camera.updateMatrixWorld()
      options.scene.updateWorldMatrix(true, true)
      raycaster.setFromCamera(pointer, options.camera)
      hits.length = 0
      raycaster.intersectObject(options.artifact, true, hits)
      const artifactHit = hits.find((hit) => isVisible(hit.object))
      if (!artifactHit) return
      // A visible foreground mesh must not allow clicks through to the artifact behind it.
      raycaster.far = Math.max(0, artifactHit.distance - 0.0001)
      hits.length = 0
      raycaster.intersectObject(options.scene, true, hits)
      raycaster.far = Infinity
      const blocked = hits.some((hit) => isVisible(hit.object))
      if (!blocked) options.activate()
    }, { signal: listeners.signal })

    options.activateButton.addEventListener('click', () => { options.activate() }, { signal: listeners.signal })
    options.resetButton.addEventListener('click', () => { options.reset() }, { signal: listeners.signal })
  } catch (error) {
    listeners.abort()
    throw error
  }
  return () => listeners.abort()
}
