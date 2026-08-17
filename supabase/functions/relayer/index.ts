// relayer: signs and posts start.gg-sourced results on-chain via
// ResolutionAdapter.postResult(). Derives its result from the existing
// `results`/`matches` tables (never a fresh start.gg call — the poller is
// the only ingestion path), and reads its signing key ONLY from Supabase
// secrets (`Deno.env.get('RELAYER_PRIVATE_KEY')`), never from the request
// body, a client header, or any persisted table. The key never appears in
// the bundle, logs, or HTTP response — see signer.ts (unit-tested
// separately, relayer.secret.test.ts / tasks.md 2.3/10.1).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createPublicClient, createWalletClient, http } from 'https://esm.sh/viem@2?bundle'
import { polygonAmoy } from 'https://esm.sh/viem@2/chains?bundle'
import { log, newRequestId } from '../_shared/log.js'
import { buildPostResultBundle, createRelayerAccount, redactSecrets } from './signer.ts'

Deno.serve(async (req) => {
  const requestId = newRequestId()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const rpcUrl = Deno.env.get('AMOY_RPC_URL')
  const resolutionAdapterAddress = Deno.env.get('RESOLUTION_ADAPTER_ADDRESS')
  const relayerPrivateKey = Deno.env.get('RELAYER_PRIVATE_KEY')
  const cronSecret = Deno.env.get('RELAYER_CRON_SECRET')

  const safeLog = (level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) => {
    // Belt-and-suspenders redaction: even though nothing here ever puts
    // the key into a field, every logged string is scrubbed before it
    // leaves this function, so a future refactor can't silently regress
    // the "key never in logs" invariant.
    const scrubbed = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? redactSecrets(v) : v]),
    )
    log[level]({ requestId, ...scrubbed })
  }

  if (!supabaseUrl || !serviceRoleKey || !rpcUrl || !resolutionAdapterAddress || !relayerPrivateKey) {
    safeLog('error', { event: 'relayer.misconfigured' })
    return new Response(JSON.stringify({ error: 'UNAVAILABLE' }), { status: 503 })
  }

  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'FORBIDDEN' }), { status: 403 })
  }

  let body: { questionId?: string; matchId?: string; winningIndex?: number }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Request body must be valid JSON.' }), { status: 400 })
  }

  const { questionId, matchId, winningIndex } = body
  if (!questionId || matchId === undefined || winningIndex === undefined) {
    return new Response(
      JSON.stringify({ error: 'VALIDATION_ERROR', message: 'questionId, matchId, and winningIndex are required.' }),
      { status: 400 },
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // Derive the posted result strictly from the ingested results/matches
  // record — this function never accepts an arbitrary outcome from the
  // caller's own claim.
  const { data: result, error: resultError } = await supabase
    .from('results')
    .select('id, winner_membership_id, match_id')
    .eq('match_id', matchId)
    .eq('status', 'OFFICIAL')
    .maybeSingle()

  if (resultError || !result) {
    safeLog('warn', { event: 'relayer.no_ingested_result', matchId })
    return new Response(JSON.stringify({ error: 'NOT_FOUND', message: 'No OFFICIAL result found for this match.' }), { status: 404 })
  }

  // Key is captured only in this closure and passed straight into viem's
  // wallet client — never assigned to a variable that outlives this
  // request or gets logged.
  const account = createRelayerAccount(relayerPrivateKey)

  const bundle = buildPostResultBundle(resolutionAdapterAddress, account.address, questionId, winningIndex, result.id)

  safeLog('info', { event: 'relayer.posting_result', questionId, matchId, winningIndex, resultRef: result.id })

  try {
    const walletClient = createWalletClient({ account: account as unknown as never, chain: polygonAmoy, transport: http(rpcUrl) })
    const publicClient = createPublicClient({ chain: polygonAmoy, transport: http(rpcUrl) })

    const hash = await walletClient.sendTransaction({ to: bundle.to as `0x${string}`, data: bundle.data as `0x${string}` })
    await publicClient.waitForTransactionReceipt({ hash })

    safeLog('info', { event: 'relayer.posted_result', questionId, txHash: hash })

    return new Response(JSON.stringify({ status: 'ok', questionId, txHash: hash }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (err) {
    // Scrub before it ever reaches the response or a log line — a raw
    // provider error could theoretically echo request internals back.
    const message = redactSecrets(String(err))
    safeLog('error', { event: 'relayer.post_result_failed', message })
    return new Response(JSON.stringify({ error: 'UNAVAILABLE', message: 'Failed to post result on-chain.' }), { status: 503 })
  }
})
