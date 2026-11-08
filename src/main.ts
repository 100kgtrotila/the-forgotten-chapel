import { App } from './core/App'
import './styles.css'

const container = document.querySelector<HTMLElement>('#app')
const status = document.querySelector<HTMLElement>('#status')
const activateButton = document.querySelector<HTMLButtonElement>('#activate-ritual')
const resetButton = document.querySelector<HTMLButtonElement>('#reset-ritual')
const ritualStatus = document.querySelector<HTMLElement>('#ritual-status')
const qualityButton = document.querySelector<HTMLButtonElement>('#quality-toggle')
const menu = document.querySelector<HTMLElement>('#chapel-menu')
const menuToggle = document.querySelector<HTMLButtonElement>('#menu-toggle')

if (!container || !status || !activateButton || !resetButton || !ritualStatus || !qualityButton || !menu || !menuToggle) throw new Error('Application elements are missing')

try {
  const app = new App(container, { activateButton, resetButton, status: ritualStatus, qualityButton, menu, menuToggle })
  import.meta.hot?.dispose(() => app.dispose())
} catch (error) {
  status.textContent = 'This scene needs a browser with WebGL support.'
  console.error('Unable to start the chapel scene', error)
}
