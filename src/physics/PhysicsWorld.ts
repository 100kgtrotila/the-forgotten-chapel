import RAPIER from '@dimforge/rapier3d-compat'
import type * as THREE from 'three'

export interface StaticCollider {
  center: readonly [number, number, number]
  halfExtents: readonly [number, number, number]
}

export interface PhysicsStone {
  mesh: THREE.Mesh
  radius: number
  velocity?: readonly [number, number, number]
}

const FIXED_TIMESTEP = 1 / 60
const MAX_SUBSTEPS = 5
// Rapier's WASM module is initialized once; every App still owns its own World.
let initialization: Promise<void> | undefined

export class PhysicsWorld {
  private readonly world: RAPIER.World
  private readonly bindings: Array<{ mesh: THREE.Mesh; body: RAPIER.RigidBody }> = []
  private accumulator = 0
  private disposed = false

  static async create(surfaces: readonly StaticCollider[]): Promise<PhysicsWorld> {
    await (initialization ??= RAPIER.init())
    return new PhysicsWorld(surfaces)
  }

  private constructor(surfaces: readonly StaticCollider[]) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.world.timestep = FIXED_TIMESTEP
    for (const surface of surfaces) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(...surface.halfExtents)
        .setTranslation(...surface.center).setFriction(0.9).setRestitution(0.1))
    }
  }

  get bodyCount(): number { return this.disposed ? 0 : this.world.bodies.len() }
  get colliderCount(): number { return this.disposed ? 0 : this.world.colliders.len() }

  release(stones: readonly PhysicsStone[]): void {
    if (this.disposed || this.bindings.length > 0) return
    for (const [index, stone] of stones.entries()) {
      // Ritual stones live in an identity-transform group, so local and world transforms agree.
      const { position, quaternion } = stone.mesh
      const velocity = stone.velocity ?? [0, 0, 0]
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(quaternion)
        .setLinvel(...velocity)
        .setAngvel({ x: 0.8 + index * 0.12, y: 0.5, z: -0.3 })
        .setLinearDamping(0.25).setAngularDamping(1.6).setCcdEnabled(true))
      this.world.createCollider(RAPIER.ColliderDesc.ball(stone.radius)
        .setDensity(2.5).setFriction(0.85).setRestitution(0.2), body)
      this.bindings.push({ mesh: stone.mesh, body })
    }
  }

  step(delta: number): void {
    if (this.disposed || this.bindings.length === 0 || !Number.isFinite(delta) || delta <= 0) return
    this.accumulator = Math.min(this.accumulator + delta, FIXED_TIMESTEP * MAX_SUBSTEPS)
    let steps = 0
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_SUBSTEPS) {
      this.world.step()
      this.accumulator -= FIXED_TIMESTEP
      steps++
    }
    for (const { mesh, body } of this.bindings) {
      const position = body.translation()
      const rotation = body.rotation()
      mesh.position.set(position.x, position.y, position.z)
      mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    }
  }

  reset(): void {
    if (this.disposed) return
    for (const { body } of this.bindings) this.world.removeRigidBody(body)
    this.bindings.length = 0
    this.accumulator = 0
  }

  dispose(): void {
    if (this.disposed) return
    this.world.free()
    this.bindings.length = 0
    this.disposed = true
  }
}
