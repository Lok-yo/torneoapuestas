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
    // contracts/** is a separate Foundry workspace (forge test owns
    // *.t.sol; contracts/lib/** is a vendored forge-std/openzeppelin-
    // contracts dependency tree with its own Hardhat/Truffle JS test
    // suite that Vitest must never try to run). supabase/functions/**
    // is a separate Deno workspace (`deno test` owns *.test.ts there —
    // see tasks.md Phase 2/8-10 RED tests).
    exclude: ['node_modules/**', 'e2e/**', 'contracts/**', 'supabase/functions/**', '.versions/**'],
  },
})
