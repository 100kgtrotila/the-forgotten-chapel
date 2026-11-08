const MAX_PHYSICS_DELTA = 0.05

/** Foreground time from animation-loop timestamps; physics has a separate budget. */
export class FrameClock {
  visualDelta = 0
  physicsDelta = 0
  private previousTime: number | null = null
  private readonly visibility: EventTarget & { readonly hidden: boolean }

  constructor(visibility: EventTarget & { readonly hidden: boolean }, signal: AbortSignal) {
    this.visibility = visibility
    visibility.addEventListener('visibilitychange', () => {
      // Discard both edges of a background pause, even if no hidden frame ran.
      this.previousTime = null
      this.visualDelta = 0
      this.physicsDelta = 0
    }, { signal })
  }

  update(time: number): void {
    this.visualDelta = 0
    this.physicsDelta = 0
    if (this.visibility.hidden || !Number.isFinite(time)) {
      this.previousTime = null
      return
    }
    if (this.previousTime !== null) this.visualDelta = Math.max(0, (time - this.previousTime) / 1000)
    this.previousTime = time
    this.physicsDelta = Math.min(this.visualDelta, MAX_PHYSICS_DELTA)
  }
}
