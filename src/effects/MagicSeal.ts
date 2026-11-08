import * as THREE from 'three'
import vertexShader from '../shaders/magicSeal.vert.glsl?raw'
import fragmentShader from '../shaders/magicSeal.frag.glsl?raw'

export class MagicSeal {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0.85 },
    uActivation: { value: 0 },
  }

  constructor(position: THREE.Vector3) {
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.NormalBlending, side: THREE.DoubleSide,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.62), material)
    this.mesh.name = 'Procedural arcane seal'
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.copy(position)
    this.mesh.renderOrder = 1
  }

  update(time: number, intensity: number, activation: number): void {
    this.uniforms.uTime.value = time
    this.uniforms.uIntensity.value = intensity
    this.uniforms.uActivation.value = activation
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
