import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // @vueuse/core 第三方库的 pure annotation 位置问题，忽略
        if (warning.code === 'INVALID_ANNOTATION') return
        warn(warning)
      },
    },
  },
})
