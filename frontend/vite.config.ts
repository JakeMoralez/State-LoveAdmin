import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        congress: resolve(__dirname, 'congress.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8013',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8013',
        changeOrigin: true,
      },
    },
  },
})
