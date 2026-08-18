import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './style.css'
import App from './App.vue'

// Apply saved theme before mount to avoid a light-mode flash
if (localStorage.getItem('theme-mode') === 'dark') {
  document.documentElement.classList.add('dark')
}

const app = createApp(App)
app.use(ElementPlus)
app.mount('#app')
