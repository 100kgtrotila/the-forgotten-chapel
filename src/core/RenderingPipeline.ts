import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export type Quality = 'high' | 'low'

export class RenderingPipeline {
  private readonly composer: EffectComposer
  private readonly scenePass: RenderPass
  private readonly bloom: UnrealBloomPass
  private readonly output: OutputPass

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    target.samples = 2
    this.composer = new EffectComposer(renderer, target)
    this.scenePass = new RenderPass(scene, camera)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.2, 0.65)
    this.output = new OutputPass()
    this.composer.addPass(this.scenePass)
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.output)
  }

  setQuality(quality: Quality): void {
    this.bloom.enabled = quality === 'high'
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      target.samples = quality === 'high' ? 2 : 0
      target.dispose()
    }
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
  }

  render(delta: number): void { this.composer.render(delta) }

  dispose(): void {
    this.scenePass.dispose()
    this.bloom.dispose()
    this.output.dispose()
    this.composer.dispose()
  }
}
