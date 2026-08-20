import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { SessionProvider } from './auth/SessionProvider.jsx'
import { I18nProvider } from './i18n/I18nProvider.jsx'
import { wagmiConfig } from './lib/web3/client.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// WagmiProvider/QueryClientProvider are mounted unconditionally — a React
// context provider has no network side effect on its own, and every real
// RPC call only happens from inside a web3 hook, which the
// FEATURE_FLAGS.web3-gated routes never render while the flag is off
// (default). See src/config/featureFlags.js and design.md Decision 7.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <SessionProvider>
              <I18nProvider>
                <App />
              </I18nProvider>
            </SessionProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </StrictMode>,
)
