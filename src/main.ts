import { createApp } from 'vue'
import './style.css'
import { initializeStorage } from './storage'

async function bootstrap() {
  // Storage must be hydrated before component modules read their initial values.
  await initializeStorage()
  const { default: App } = await import('./App.vue')
  const app = createApp(App)
  app.mount('#app')

  requestAnimationFrame(() => {
    const loader = document.getElementById('boot-loader')
    if (!loader) return
    loader.classList.add('is-hiding')
    window.setTimeout(() => loader.remove(), 180)
  })

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // The app still works normally when service workers are unavailable.
      })
    })
  }
}

void bootstrap().catch((reason) => {
  console.error('Application bootstrap failed:', reason)
  const loader = document.getElementById('boot-loader')
  if (loader) loader.textContent = '应用加载失败，请刷新重试'
})
