import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createChapel } from '../scene/createChapel.ts'
import type { ChapelScene } from '../scene/createChapel.ts'
import { CANDLE_BASE_INTENSITY, createLighting } from '../scene/createLighting.ts'
import { disposeObjectResources, loadModelSlots } from '../scene/assets.ts'
import { createChapelMaterials } from '../scene/materials.ts'
import { MagicSeal } from '../effects/MagicSeal.ts'
import { RitualController, bindRitualInteraction } from '../interaction/RitualController.ts'
import type { RitualState } from '../interaction/RitualController.ts'
import { RenderingPipeline } from './RenderingPipeline.ts'
import type { Quality } from './RenderingPipeline.ts'
import { FrameClock } from './FrameClock.ts'

interface RitualUi {
  activateButton: HTMLButtonElement
  resetButton: HTMLButtonElement
  assetStatus: HTMLElement
  status: HTMLElement
  qualityButton: HTMLButtonElement
  menu: HTMLElement
  menuToggle: HTMLButtonElement
}

export class App {
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly scene: THREE.Scene
  private readonly resizeObserver: ResizeObserver
  private readonly artifact: THREE.Group
  private readonly artifactBaseHeight: number
  private readonly candleLights: THREE.PointLight[]
  private readonly magicSeal: MagicSeal
  private readonly pipeline: RenderingPipeline
  private quality: Quality = 'high'
  private readonly uiEvents = new AbortController()
  private readonly frameClock = new FrameClock(document, this.uiEvents.signal)
  private readonly diagnostics = new URLSearchParams(location.search).get('diagnostics') === '1'
  private diagnosticFrames = 0
  private diagnosticDuration = 0
  private previousDiagnosticTime: number | null = null
  private ritual: RitualController | null = null
  private unbindRitual: (() => void) | null = null
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly assetLoading = new AbortController()
  private framingDistance: number | null = null
  private elapsed = 0

  private readonly container: HTMLElement
  private readonly ritualUi: RitualUi

  constructor(container: HTMLElement, ritualUi: RitualUi) {
    this.container = container
    this.ritualUi = ritualUi
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#0b1019')
    this.scene.fog = new THREE.FogExp2('#101722', 0.025)

    const materialSetup = createChapelMaterials(this.assetLoading.signal)
    const chapel = createChapel(materialSetup.materials)
    this.scene.add(chapel.group)
    this.artifact = chapel.artifact
    this.artifactBaseHeight = chapel.artifact.position.y
    this.candleLights = createLighting(this.scene, chapel.candlePositions).candleLights
    this.magicSeal = new MagicSeal(chapel.altarSurface)
    this.scene.add(this.magicSeal.mesh)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 90)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.6
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D chapel courtyard. Drag to orbit and scroll to zoom.')
    this.container.append(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 2.1, -0.6)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.enablePan = false
    this.controls.minDistance = 6
    this.controls.maxDistance = 36
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = Math.PI * 0.49

    this.pipeline = new RenderingPipeline(this.renderer, this.scene, this.camera)
    this.renderer.info.autoReset = false
    this.ritualUi.menuToggle.addEventListener('click', () => {
      const { menu, menuToggle } = this.ritualUi
      menu.hidden = !menu.hidden
      menuToggle.setAttribute('aria-expanded', String(!menu.hidden))
      menuToggle.textContent = menu.hidden ? 'Show UI' : 'Hide UI'
    }, { signal: this.uiEvents.signal })
    this.ritualUi.qualityButton.addEventListener('click', () => {
      this.quality = this.quality === 'high' ? 'low' : 'high'
      this.pipeline.setQuality(this.quality)
      this.ritualUi.qualityButton.textContent = `Quality: ${this.quality === 'high' ? 'High' : 'Low'}`
      this.ritualUi.qualityButton.setAttribute('aria-pressed', String(this.quality === 'low'))
      this.scene.traverse((object) => {
        if (!(object instanceof THREE.DirectionalLight)) return
        const size = this.quality === 'high' ? 1024 : 512
        object.shadow.mapSize.set(size, size)
        object.shadow.map?.dispose()
        object.shadow.map = null
      })
      this.resize()
    }, { signal: this.uiEvents.signal })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()
    for (const key of ['loadedModels', 'failedModels', 'skippedModelSlots', 'missingResources', 'missingOptionalTextures', 'initializationError', 'ritualState']) {
      delete this.container.dataset[key]
    }
    this.ritualUi.activateButton.disabled = true
    this.ritualUi.resetButton.disabled = true
    this.ritualUi.qualityButton.textContent = 'Quality: High'
    this.ritualUi.qualityButton.setAttribute('aria-pressed', 'false')
    this.ritualUi.status.textContent = 'Preparing ritual…'
    this.ritualUi.assetStatus.textContent = 'Loading chapel assets…'
    this.container.dataset.assets = 'loading'
    this.renderer.setAnimationLoop(this.animate)
    void this.initializeRitual(chapel, materialSetup.materials.oldStone).catch((error: unknown) => {
      if (this.assetLoading.signal.aborted) return
      this.container.dataset.assets = 'error'
      this.container.dataset.initializationError = 'ritual'
      this.ritualUi.assetStatus.textContent = 'Chapel initialization failed.'
      this.ritualUi.activateButton.disabled = true
      this.ritualUi.resetButton.disabled = true
      this.ritualUi.status.textContent = 'The ritual could not initialize. Reload to try again.'
      console.error('Unable to initialize ritual physics', error)
    })
    void Promise.all([
      materialSetup.ready,
      loadModelSlots(chapel.modelSlots, this.assetLoading.signal),
    ]).then(([textures, models]) => {
      if (this.assetLoading.signal.aborted) return
      this.container.dataset.loadedModels = JSON.stringify(models.loadedModelIds)
      this.container.dataset.failedModels = JSON.stringify(models.failedModelIds)
      this.container.dataset.skippedModelSlots = JSON.stringify(models.skippedOptionalSlots)
      this.container.dataset.missingResources = JSON.stringify(models.missingResources)
      this.container.dataset.missingOptionalTextures = JSON.stringify(textures.missingOptionalTextures)
      if (this.container.dataset.assets !== 'error') {
        this.container.dataset.assets = models.failedModelIds.length ? 'degraded' : 'ready'
        this.ritualUi.assetStatus.textContent = models.failedModelIds.length
          ? 'Some chapel models could not load. Reload to retry.' : ''
      }
    }).catch((error: unknown) => {
      if (this.assetLoading.signal.aborted) return
      this.container.dataset.assets = 'error'
      this.container.dataset.initializationError = 'assets'
      this.ritualUi.assetStatus.textContent = 'Chapel assets could not initialize. Reload to retry.'
      console.error('Chapel assets could not finish loading', error)
    })
  }

  private async initializeRitual(chapel: ChapelScene, stoneMaterial: THREE.Material): Promise<void> {
    const { PhysicsWorld } = await import('../physics/PhysicsWorld.ts')
    if (this.assetLoading.signal.aborted) return
    const physics = await PhysicsWorld.create(chapel.colliders)
    if (this.assetLoading.signal.aborted) {
      physics.dispose()
      return
    }
    let ritual: RitualController | null = null
    try {
      this.artifact.position.y = this.artifactBaseHeight
      this.artifact.rotation.y = 0
      const controller = new RitualController({
        artifact: this.artifact, stoneMaterial, seal: this.magicSeal, physics,
        onStateChange: (state) => this.updateRitualUi(state),
      })
      ritual = controller
      this.scene.add(controller.group, controller.effects.group)
      this.unbindRitual = bindRitualInteraction({
        canvas: this.renderer.domElement, camera: this.camera, artifact: this.artifact, scene: this.scene,
        activateButton: this.ritualUi.activateButton, resetButton: this.ritualUi.resetButton,
        activate: () => controller.activate(), reset: () => controller.reset(),
      })
      this.ritual = controller
    } catch (error) {
      if (ritual) ritual.dispose()
      else physics.dispose()
      throw error
    }
  }

  private updateRitualUi(state: RitualState): void {
    const messages: Record<RitualState, string> = {
      idle: 'Select the artifact or activate the ritual.',
      activating: 'The relic draws power from the seal…',
      released: 'The relic is awakened. Reset to repeat the ritual.',
    }
    this.ritualUi.activateButton.disabled = state !== 'idle'
    this.ritualUi.resetButton.disabled = false
    this.ritualUi.status.textContent = messages[state]
    this.container.dataset.ritualState = state
  }

  private resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const pixelRatio = Math.min(window.devicePixelRatio, this.quality === 'high' ? 1.5 : 1)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    this.pipeline.resize(width, height, pixelRatio)

    const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect)
    const distance = THREE.MathUtils.clamp(7.5 / Math.tan(horizontalFov / 2), 16, 34)
    const direction = this.framingDistance === null
      ? new THREE.Vector3(0.53, 0.35, 0.77).normalize().multiplyScalar(distance)
      : this.camera.position.clone().sub(this.controls.target).multiplyScalar(distance / this.framingDistance)
    direction.clampLength(this.controls.minDistance, this.controls.maxDistance)
    this.camera.position.copy(this.controls.target).add(direction)
    this.framingDistance = distance
    this.controls.update()
  }

  private readonly animate = (time: number): void => {
    this.frameClock.update(time)
    if (document.hidden) return
    const delta = this.frameClock.visualDelta
    this.elapsed += delta

    if (this.ritual) {
      this.ritual.update(delta, !this.reducedMotion.matches, this.frameClock.physicsDelta)
    } else {
      if (!this.reducedMotion.matches) this.artifact.rotation.y += delta * 0.32
      this.artifact.position.y = this.artifactBaseHeight
        + (this.reducedMotion.matches ? 0 : Math.sin(this.elapsed * 0.9) * 0.13)
      this.magicSeal.update(this.reducedMotion.matches ? 0 : this.elapsed, 0.85, 0)
    }
    for (let index = 0; index < this.candleLights.length; index++) {
      const light = this.candleLights[index]
      light.intensity = this.reducedMotion.matches ? CANDLE_BASE_INTENSITY : CANDLE_BASE_INTENSITY
        + Math.sin(this.elapsed * 3.1 + index * 1.7) * 0.13
        + Math.sin(this.elapsed * 7.4 + index * 2.3) * 0.07
    }

    this.controls.update()
    this.renderer.info.reset()
    this.pipeline.render(delta)
    if (this.diagnostics) {
      this.diagnosticFrames++
      this.diagnosticDuration += this.previousDiagnosticTime === null ? 0 : (time - this.previousDiagnosticTime)
      this.previousDiagnosticTime = time
      if (this.diagnosticFrames >= 120) {
        this.container.dataset.renderCalls = String(this.renderer.info.render.calls)
        this.container.dataset.triangles = String(this.renderer.info.render.triangles)
        this.container.dataset.geometries = String(this.renderer.info.memory.geometries)
        this.container.dataset.textures = String(this.renderer.info.memory.textures)
        this.container.dataset.drawingBuffer = `${this.renderer.domElement.width}x${this.renderer.domElement.height}`
        this.container.dataset.pixelRatio = String(this.renderer.getPixelRatio())
        this.container.dataset.frameIntervalMs = (this.diagnosticDuration / (this.diagnosticFrames - 1)).toFixed(2)
        this.container.dataset.quality = this.quality
        this.diagnosticFrames = 0
        this.diagnosticDuration = 0
        this.previousDiagnosticTime = null
      }
    }
  }

  dispose(): void {
    if (this.assetLoading.signal.aborted) return
    this.assetLoading.abort()
    this.uiEvents.abort()
    this.renderer.setAnimationLoop(null)
    this.unbindRitual?.()
    this.ritual?.dispose()
    this.magicSeal.dispose()
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.pipeline.dispose()

    disposeObjectResources(this.scene)
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight || object instanceof THREE.PointLight) {
        object.shadow.dispose()
      }
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
