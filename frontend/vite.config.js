import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,          // 讓手機可以透過區網 IP 連線
    proxy: {
      '/auth':         { target: 'http://localhost:8000', changeOrigin: true },
      '/admin':        { target: 'http://localhost:8000', changeOrigin: true },
      '/client':       { target: 'http://localhost:8000', changeOrigin: true },
      '/analyze':      { target: 'http://localhost:8000', changeOrigin: true },
      '/upload':       { target: 'http://localhost:8000', changeOrigin: true },
      '/poll':         { target: 'http://localhost:8000', changeOrigin: true },
      '/result':       { target: 'http://localhost:8000', changeOrigin: true },
      '/generate-pdf': { target: 'http://localhost:8000', changeOrigin: true },
      '/health':       { target: 'http://localhost:8000', changeOrigin: true },
      '/status':       {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // SSE needs response buffering disabled
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache'
            proxyRes.headers['x-accel-buffering'] = 'no'
          })
        },
      },
    },
  },
})
