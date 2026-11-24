/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'axios'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
  server: {
    port: 5173,
    // /fakepay = the CardPay Fake demo gateway's own pages, served by the backend
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/fakepay': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
