import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

function precompressPlugin(): Plugin {
  const candidates = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest'])

  function compressFile(path: string) {
    if (!candidates.has(path.slice(path.lastIndexOf('.')))) return
    const source = readFileSync(path)
    writeFileSync(`${path}.gz`, gzipSync(source, { level: 9 }))
    writeFileSync(`${path}.br`, brotliCompressSync(source))
  }

  function walk(path: string) {
    for (const entry of readdirSync(path)) {
      const child = join(path, entry)
      if (statSync(child).isDirectory()) walk(child)
      else compressFile(child)
    }
  }

  return {
    name: 'daka-precompress',
    apply: 'build',
    closeBundle() {
      walk(resolve('dist'))
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/assets/')) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else if (request.url === '/' || request.url?.endsWith('.html')) {
          response.setHeader('Cache-Control', 'no-cache')
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), precompressPlugin()],
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/dexie')) return 'dexie'
          if (id.includes('node_modules/vue') || id.includes('node_modules/@vue')) return 'vue'
        },
      },
      onwarn(warning, warn) {
        // @vueuse/core 第三方库的 pure annotation 位置问题，忽略
        if (warning.code === 'INVALID_ANNOTATION') return
        warn(warning)
      },
    },
  },
})
