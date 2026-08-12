import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitest.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: true,
    // Playwright owns e2e/**; it uses its own test/describe globals that
    // conflict with Vitest's when picked up by the default include glob.
    exclude: ['node_modules/**', 'e2e/**'],
  },
})
