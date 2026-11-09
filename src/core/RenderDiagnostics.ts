import type { WebGLRenderer } from 'three'
import type { Quality } from './RenderingPipeline.ts'

const SAMPLE_FRAMES = 120

export class RenderDiagnostics {
  private readonly container: HTMLElement
  private readonly renderer: WebGLRenderer
  private frames = 0
  private duration = 0
  private previousTime: number | null = null

  constructor(container: HTMLElement, renderer: WebGLRenderer) {
    this.container = container
    this.renderer = renderer
  }

  update(time: number, quality: Quality): void {
    this.frames++
    this.duration += this.previousTime === null ? 0 : time - this.previousTime
    this.previousTime = time
    if (this.frames < SAMPLE_FRAMES) return

    const { renderer, container } = this
    container.dataset.renderCalls = String(renderer.info.render.calls)
    container.dataset.triangles = String(renderer.info.render.triangles)
    container.dataset.geometries = String(renderer.info.memory.geometries)
    container.dataset.textures = String(renderer.info.memory.textures)
    container.dataset.drawingBuffer = `${renderer.domElement.width}x${renderer.domElement.height}`
    container.dataset.pixelRatio = String(renderer.getPixelRatio())
    container.dataset.frameIntervalMs = (this.duration / (this.frames - 1)).toFixed(2)
    container.dataset.quality = quality
    this.frames = 0
    this.duration = 0
    this.previousTime = null
  }
}
