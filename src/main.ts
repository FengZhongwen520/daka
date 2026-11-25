import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// Apply saved theme before mount to avoid a light-mode flash
if (localStorage.getItem('theme-mode') === 'dark') {
  document.documentElement.classList.add('dark')
}

const app = createApp(App)
app.mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // The app still works normally when service workers are unavailable.
    })
  })
}
