/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('firebase')) {
            return 'firebase-vendor'
          }

          if (
            id.includes('/react-router-dom/')
            || id.includes('/react-dom/')
            || id.includes('/react/')
            || id.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }

          if (id.includes('/lucide-react/')) {
            return 'icons-vendor'
          }

          if (id.includes('/date-fns/') || id.includes('/react-use/')) {
            return 'utility-vendor'
          }

          if (id.includes('/sonner/')) {
            return 'toast-vendor'
          }

          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true
  }
})
