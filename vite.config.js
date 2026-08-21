import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { anvilDevPlugin } from './vite-plugin-anvil.js'

const demoMode = process.env.VITE_DEMO_ANVIL === 'true'

if (demoMode) {
  for (const name of ['ANVIL_RPC_URL', 'APP_HOST', 'PORT']) {
    if (!String(process.env[name] || '').trim()) {
      throw new Error(`${name} is required when VITE_DEMO_ANVIL=true.`)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), anvilDevPlugin()],
  server: {
    host: demoMode ? '0.0.0.0' : '127.0.0.1',
    port: demoMode ? Number(process.env.PORT || 3000) : 5173,
    strictPort: true,
    allowedHosts: demoMode ? [process.env.APP_HOST] : undefined,
    hmr: demoMode
      ? false
      : {
          protocol: 'ws',
          host: '127.0.0.1',
          port: 5173,
        },
    proxy: demoMode
      ? {
          '/rpc': {
            target: process.env.ANVIL_RPC_URL,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/rpc/, '') || '/',
          },
        }
      : undefined,
  },
})
