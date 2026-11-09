import * as THREE from 'three'
import { createChapel } from '../scene/createChapel.ts'
import type { ChapelScene } from '../scene/createChapel.ts'
import { CANDLE_BASE_INTENSITY, createLighting } from '../scene/createLighting.ts'
import { disposeObjectResources, loadModelSlots } from '../scene/assets.ts'
import { createChapelMaterials } from '../scene/materials.ts'
import { MagicSeal } from '../effects/MagicSeal.ts'
import { RitualController, bindRitualInteraction } from '../interaction/RitualController.ts'
import type { RitualState } from '../interaction/RitualController.ts'
import { SceneView } from './SceneView.ts'
import { RenderDiagnostics } from './RenderDiagnostics.ts'
import { FrameClock } from './FrameClock.ts'
import { SCENE_CONFIG } from '../config/scene.config.ts'
import { ChapelUI } from '../ui/ChapelUI.ts'
import type { ChapelUIElements } from '../ui/ChapelUI.ts'

export class App {
  private readonly scene: THREE.Scene
  private readonly view: SceneView
  private readonly diagnostics: RenderDiagnostics | null
  private readonly artifact: THREE.Group
  private readonly artifactBaseHeight: number
  private readonly candleLights: THREE.PointLight[]
  private readonly magicSeal: MagicSeal
  private readonly lifecycleEvents = new AbortController()
  private readonly frameClock = new FrameClock(document, this.lifecycleEvents.signal)
  private ritual: RitualController | null = null
  private unbindRitual: (() => void) | null = null
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private readonly assetLoading = new AbortController()
  private elapsed = 0

  private readonly container: HTMLElement
  private readonly ui: ChapelUI

  constructor(container: HTMLElement, uiElements: ChapelUIElements) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(SCENE_CONFIG.background)
    this.scene.fog = new THREE.FogExp2(SCENE_CONFIG.fog.color, SCENE_CONFIG.fog.density)

    const materialSetup = createChapelMaterials(this.assetLoading.signal)
    const chapel = createChapel(materialSetup.materials)
    this.scene.add(chapel.group)
    this.artifact = chapel.artifact
    this.artifactBaseHeight = chapel.artifact.position.y
    this.candleLights = createLighting(this.scene, chapel.candlePositions).candleLights
    this.magicSeal = new MagicSeal(chapel.altarSurface)
    this.scene.add(this.magicSeal.mesh)

    this.view = new SceneView(container, this.scene)
    this.diagnostics = new URLSearchParams(location.search).get('diagnostics') === '1'
      ? new RenderDiagnostics(container, this.view.renderer) : null
    for (const key of ['loadedModels', 'failedModels', 'skippedModelSlots', 'missingResources', 'missingOptionalTextures', 'initializationError', 'ritualState']) {
      delete this.container.dataset[key]
    }
    this.ui = new ChapelUI(uiElements, () => this.toggleQuality())
    this.container.dataset.assets = 'loading'
    this.view.renderer.setAnimationLoop(this.animate)
    void this.initializeRitual(chapel, materialSetup.materials.oldStone).catch((error: unknown) => {
      if (this.assetLoading.signal.aborted) return
      this.container.dataset.assets = 'error'
      this.container.dataset.initializationError = 'ritual'
      this.ui.showInitializationError('ritual')
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
        const state = models.failedModelIds.length ? 'degraded' : 'ready'
        this.container.dataset.assets = state
        this.ui.setAssetState(state)
      }
    }).catch((error: unknown) => {
      if (this.assetLoading.signal.aborted) return
      this.container.dataset.assets = 'error'
      this.container.dataset.initializationError = 'assets'
      this.ui.showInitializationError('assets')
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
        canvas: this.view.renderer.domElement, camera: this.view.camera, artifact: this.artifact, scene: this.scene,
        activateButton: this.ui.elements.activateButton, resetButton: this.ui.elements.resetButton,
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
    this.ui.setRitualState(state)
    this.container.dataset.ritualState = state
  }

  private toggleQuality(): void {
    const quality = this.view.quality === 'high' ? 'low' : 'high'
    this.view.setQuality(quality)
    this.ui.setQuality(quality)
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

    this.view.render(delta)
    this.diagnostics?.update(time, this.view.quality)
  }

  dispose(): void {
    if (this.assetLoading.signal.aborted) return
    this.assetLoading.abort()
    this.lifecycleEvents.abort()
    this.ui.dispose()
    this.view.renderer.setAnimationLoop(null)
    this.unbindRitual?.()
    this.ritual?.dispose()
    this.magicSeal.dispose()

    disposeObjectResources(this.scene)
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight || object instanceof THREE.PointLight) {
        object.shadow.dispose()
      }
    })
    this.view.dispose()
  }
}
