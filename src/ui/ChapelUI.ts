import type { RitualState } from '../interaction/RitualController.ts'
import type { Quality } from '../core/RenderingPipeline.ts'

export interface ChapelUIElements {
  activateButton: HTMLButtonElement
  resetButton: HTMLButtonElement
  assetStatus: HTMLElement
  status: HTMLElement
  qualityButton: HTMLButtonElement
  menu: HTMLElement
  menuToggle: HTMLButtonElement
}

const RITUAL_MESSAGES: Record<RitualState, string> = {
  idle: 'Select the artifact or activate the ritual.',
  activating: 'The relic draws power from the seal…',
  released: 'The relic is awakened. Reset to repeat the ritual.',
}

export class ChapelUI {
  readonly elements: ChapelUIElements
  private readonly events = new AbortController()

  constructor(elements: ChapelUIElements, onToggleQuality: () => void) {
    this.elements = elements
    elements.activateButton.disabled = true
    elements.resetButton.disabled = true
    elements.status.textContent = 'Preparing ritual…'
    elements.assetStatus.textContent = 'Loading chapel assets…'
    this.setQuality('high')

    elements.menuToggle.addEventListener('click', () => {
      elements.menu.hidden = !elements.menu.hidden
      elements.menuToggle.setAttribute('aria-expanded', String(!elements.menu.hidden))
      elements.menuToggle.textContent = elements.menu.hidden ? 'Show UI' : 'Hide UI'
    }, { signal: this.events.signal })
    elements.qualityButton.addEventListener('click', onToggleQuality, { signal: this.events.signal })
  }

  setQuality(quality: Quality): void {
    this.elements.qualityButton.textContent = `Quality: ${quality === 'high' ? 'High' : 'Low'}`
    this.elements.qualityButton.setAttribute('aria-pressed', String(quality === 'low'))
  }

  setRitualState(state: RitualState): void {
    this.elements.activateButton.disabled = state !== 'idle'
    this.elements.resetButton.disabled = false
    this.elements.status.textContent = RITUAL_MESSAGES[state]
  }

  setAssetState(state: 'ready' | 'degraded'): void {
    this.elements.assetStatus.textContent = state === 'degraded'
      ? 'Some chapel models could not load. Reload to retry.' : ''
  }

  showInitializationError(source: 'ritual' | 'assets'): void {
    if (source === 'assets') {
      this.elements.assetStatus.textContent = 'Chapel assets could not initialize. Reload to retry.'
      return
    }
    this.elements.assetStatus.textContent = 'Chapel initialization failed.'
    this.elements.activateButton.disabled = true
    this.elements.resetButton.disabled = true
    this.elements.status.textContent = 'The ritual could not initialize. Reload to try again.'
  }

  dispose(): void {
    this.events.abort()
  }
}
