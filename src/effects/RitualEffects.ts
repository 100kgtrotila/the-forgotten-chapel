import * as THREE from 'three'

const PARTICLE_COUNT = 96
const PARTICLE_HEIGHT = 2.6

// All buffers are allocated once; the controller supplies the ritual's timeline.
export class RitualEffects {
  readonly group = new THREE.Group()
  private readonly ribbons = new THREE.Group()
  private readonly positions = new Float32Array(PARTICLE_COUNT * 3)
  private readonly particles: THREE.Points
  private readonly wave: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  private readonly aura: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>
  private readonly light = new THREE.PointLight('#8d78be', 0.35, 5, 2)
  private readonly idleColor = new THREE.Color('#8d78be')
  private readonly chargedColor = new THREE.Color('#eac188')
  private readonly uniforms = {
    uTime: { value: 0 }, uPower: { value: 0 },
    uBottom: { value: 0 }, uParticleHeight: { value: PARTICLE_HEIGHT },
  }
  private readonly flowMaterial: THREE.ShaderMaterial
  private readonly particleMaterial: THREE.ShaderMaterial
  private disposed = false
  private readonly center: THREE.Vector3

  constructor(center: THREE.Vector3) {
    this.center = center
    this.uniforms.uBottom.value = center.y - 0.82
    this.group.name = 'Ritual energy'
    const sealHeight = center.y - 0.88
    this.ribbons.position.set(center.x, sealHeight, center.z)
    const geometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const uvs: number[] = []
    const indices: number[] = []
    const segments = 96
    for (let index = 0; index <= segments; index++) {
      const t = index / segments
      const angle = t * Math.PI * 3
      const radius = 0.95 - t * 0.43
      for (const side of [-1, 1]) {
        const edge = radius + side * 0.045
        positions.push(Math.cos(angle) * edge, t * 2.35, Math.sin(angle) * edge)
        uvs.push(t, (side + 1) / 2)
      }
      if (index < segments) {
        const start = index * 2
        indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2)
      }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeBoundingSphere()
    this.flowMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uPower; varying vec2 vUv;
        void main() {
          float edge = pow(max(0.0, 1.0 - abs(vUv.y * 2.0 - 1.0)), 1.5);
          float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
          float flow = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(vUv.x * 32.0 - uTime * 7.0), 3.0);
          vec3 color = mix(vec3(0.8, 0.47, 0.15), vec3(0.45, 0.25, 0.8), vUv.x);
          gl_FragColor = vec4(color * (1.0 + uPower * 2.0), edge * ends * flow * uPower * 0.7);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    for (const angle of [0, Math.PI]) {
      const ribbon = new THREE.Mesh(geometry, this.flowMaterial)
      ribbon.rotation.y = angle
      this.ribbons.add(ribbon)
    }
    this.aura = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 2.25, 48, 1, true), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uPower; varying vec2 vUv;
        void main() {
          float fade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
          float wisps = pow(0.5 + 0.5 * sin(vUv.x * 75.398 + vUv.y * 9.0 - uTime * 1.6), 7.0);
          vec3 color = mix(vec3(0.8, 0.5, 0.18), vec3(0.35, 0.2, 0.65), vUv.y);
          gl_FragColor = vec4(color, fade * (0.035 + wisps * 0.16) * uPower);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }))
    this.aura.position.set(center.x, sealHeight + 1.125, center.z)
    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    // The bounded volume is shared by every phase of the animated particles.
    particleGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(center.x, center.y + 0.2, center.z), 4)
    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying float vHeight;
        void main() {
          vec4 point = modelViewMatrix * vec4(position, 1.0);
          vHeight = position.y;
          gl_PointSize = clamp(55.0 / max(0.1, -point.z), 1.0, 4.0);
          gl_Position = projectionMatrix * point;
        }`,
      fragmentShader: `uniform float uPower; uniform float uBottom; uniform float uParticleHeight; varying float vHeight;
        void main() {
          float radius = length(gl_PointCoord - 0.5) * 2.0;
          float glow = 1.0 - smoothstep(0.05, 1.0, radius);
          float life = (vHeight - uBottom) / uParticleHeight;
          float fade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.78, 1.0, life));
          vec3 color = mix(vec3(1.0, 0.68, 0.3), vec3(0.65, 0.45, 1.0), 0.5 + 0.5 * sin(vHeight * 2.0));
          gl_FragColor = vec4(color * 2.0, glow * fade * uPower * 0.8);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    this.particles = new THREE.Points(particleGeometry, this.particleMaterial)
    this.particles.name = 'Rising ritual embers'
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 96), new THREE.MeshBasicMaterial({
      color: '#dfbc83', transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }))
    this.wave.rotation.x = -Math.PI / 2
    this.wave.name = 'Ritual shockwave'
    this.wave.position.set(center.x, center.y + 0.4, center.z)
    this.light.position.copy(center)
    this.group.add(this.ribbons, this.aura, this.particles, this.wave, this.light)
    this.update(0, 0, -1, true)
  }

  update(time: number, charge: number, releasedTime: number, motion: boolean): void {
    const burst = releasedTime < 0 ? 0 : Math.exp(-releasedTime * 1.8)
    const power = Math.max(charge, burst)
    this.uniforms.uTime.value = motion ? time : 0
    this.uniforms.uPower.value = power
    this.ribbons.visible = motion && power > 0.01
    this.aura.visible = power > 0.01
    this.particles.visible = motion && power > 0.01
    this.ribbons.rotation.y = motion ? -time * 1.1 : 0
    this.ribbons.scale.setScalar(1 + burst * 0.35)
    this.wave.visible = motion && releasedTime >= 0 && releasedTime < 0.85
    this.wave.scale.setScalar(0.3 + Math.max(0, releasedTime) * 3.4)
    this.wave.material.opacity = Math.max(0, 1 - Math.max(0, releasedTime) / 0.85) * 0.65
    this.light.color.copy(this.idleColor).lerp(this.chargedColor, power)
    this.light.intensity = 0.35 + power * (motion ? 8 : 1)
    this.light.position.y = this.center.y + charge * 0.5
    if (!this.particles.visible) return
    for (let index = 0; index < PARTICLE_COUNT; index++) {
      const phase = (index / PARTICLE_COUNT + time * 0.24) % 1
      const angle = index * 2.39996 + time * (0.8 + charge * 1.5)
      const radius = (0.9 - phase * 0.55) * (1 + burst * 1.5)
      const offset = index * 3
      this.positions[offset] = this.center.x + Math.cos(angle) * radius
      this.positions[offset + 1] = this.uniforms.uBottom.value + phase * PARTICLE_HEIGHT
      this.positions[offset + 2] = this.center.z + Math.sin(angle) * radius
    }
    this.particles.geometry.attributes.position.needsUpdate = true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.group.removeFromParent()
    const ribbon = this.ribbons.children[0]
    if (ribbon instanceof THREE.Mesh) ribbon.geometry.dispose()
    this.flowMaterial.dispose()
    this.aura.geometry.dispose()
    this.aura.material.dispose()
    this.particles.geometry.dispose()
    this.particleMaterial.dispose()
    this.wave.geometry.dispose()
    this.wave.material.dispose()
  }
}
