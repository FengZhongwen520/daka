import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { handleNewsRequest } from './server/news-service.mjs'

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
    name: 'yechao-precompress',
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

function newsApiPlugin(): Plugin {
  function install(server: ViteDevServer | PreviewServer) {
    server.middlewares.use((request, response, next) => {
      if (!request.url?.startsWith('/api/news') && request.url !== '/api/health') {
        next()
        return
      }
      void handleNewsRequest(request, response).catch((error) => {
        if (!response.writableEnded) {
          response.statusCode = 500
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: String(error) }))
        }
      })
    })
  }

  return {
    name: 'yechao-news-api',
    configureServer: install,
    configurePreviewServer: install,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), precompressPlugin(), newsApiPlugin()],
  base: './',
  server: {
    proxy: {
      '/api': {
        target: process.env.DAKA_SERVE_PROXY || 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.DAKA_SERVE_PROXY?.replace(/^http/, 'ws') || 'ws://localhost:8080',
        ws: true,
      },
    },
  },
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
