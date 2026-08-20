import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { anvilDevPlugin } from './vite-plugin-anvil.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), anvilDevPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 5173,
    },
  },
})
