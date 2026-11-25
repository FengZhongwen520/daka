import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

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
