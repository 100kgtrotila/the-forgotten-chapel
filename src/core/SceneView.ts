import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { SCENE_CONFIG } from '../config/scene.config.ts'
import { RENDERING_CONFIG } from '../config/rendering.config.ts'
import { RenderingPipeline } from './RenderingPipeline.ts'
import type { Quality } from './RenderingPipeline.ts'

/** Owns the viewport and its GPU resources; App supplies the render loop. */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer
  readonly camera: THREE.PerspectiveCamera
  private readonly container: HTMLElement
  private readonly scene: THREE.Scene
  private readonly controls: OrbitControls
  private readonly pipeline: RenderingPipeline
  private readonly resizeObserver: ResizeObserver
  private currentQuality: Quality = 'high'
  private framingDistance: number | null = null
  private disposed = false

  constructor(container: HTMLElement, scene: THREE.Scene) {
    this.container = container
    this.scene = scene
    const camera = SCENE_CONFIG.camera
    this.camera = new THREE.PerspectiveCamera(camera.fov, 1, camera.near, camera.far)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = RENDERING_CONFIG.exposure
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.info.autoReset = false
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D chapel courtyard. Drag to orbit and scroll to zoom.')
    container.append(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    const controls = SCENE_CONFIG.controls
    this.controls.target.set(controls.target.x, controls.target.y, controls.target.z)
    this.controls.enableDamping = controls.enableDamping
    this.controls.dampingFactor = controls.dampingFactor
    this.controls.enablePan = controls.enablePan
    this.controls.minDistance = controls.minDistance
    this.controls.maxDistance = controls.maxDistance
    this.controls.minPolarAngle = controls.minPolarAngle
    this.controls.maxPolarAngle = controls.maxPolarAngle

    this.pipeline = new RenderingPipeline(this.renderer, scene, this.camera)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  get quality(): Quality { return this.currentQuality }

  setQuality(quality: Quality): void {
    this.currentQuality = quality
    this.pipeline.setQuality(quality)
    const size = RENDERING_CONFIG.quality[quality].shadowMapSize
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.DirectionalLight)) return
      object.shadow.mapSize.set(size, size)
      object.shadow.map?.dispose()
      object.shadow.map = null
    })
    this.resize()
  }

  private resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const pixelRatio = Math.min(window.devicePixelRatio, RENDERING_CONFIG.quality[this.currentQuality].pixelRatio)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    this.pipeline.resize(width, height, pixelRatio)

    const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect)
    const framing = SCENE_CONFIG.camera.framing
    const distance = THREE.MathUtils.clamp(framing.sceneHalfWidth / Math.tan(horizontalFov / 2), framing.minDistance, framing.maxDistance)
    const direction = this.framingDistance === null
      ? new THREE.Vector3(framing.direction.x, framing.direction.y, framing.direction.z).normalize().multiplyScalar(distance)
      : this.camera.position.clone().sub(this.controls.target).multiplyScalar(distance / this.framingDistance)
    direction.clampLength(this.controls.minDistance, this.controls.maxDistance)
    this.camera.position.copy(this.controls.target).add(direction)
    this.framingDistance = distance
    this.controls.update()
  }

  render(delta: number): void {
    this.controls.update()
    this.renderer.info.reset()
    this.pipeline.render(delta)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.pipeline.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
