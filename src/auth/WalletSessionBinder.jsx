import { useEffect, useRef } from 'react'
import { useDisconnect } from 'wagmi'
import { useSession } from './SessionProvider.jsx'

/** Disconnect MetaMask when the Google user changes or signs out. */
export default function WalletSessionBinder() {
  const { session, status } = useSession()
  const { disconnect } = useDisconnect()
  const prev = useRef(null)

  useEffect(() => {
    const id = session?.user?.id ?? null
    if (status === 'anonymous' || (prev.current && id && prev.current !== id)) {
      try {
        disconnect()
      } catch {
        // wallet already disconnected
      }
    }
    prev.current = id
  }, [session?.user?.id, status, disconnect])

  return null
}
