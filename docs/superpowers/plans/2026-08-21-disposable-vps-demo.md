# Disposable University VPS Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the complete GG2 university demo from Docker Compose on one university-assigned, loopback-bound host port, with browser-visible Vite `/__anvil/*` behavior, same-origin HTTPS JSON-RPC, automatic settlement, deterministic contract bootstrap, and Anvil state that survives ordinary container restarts.

**Architecture:** Compose runs four roles: an internal Anvil node, a one-shot contract bootstrap, the Vite development server, and the Node settlement worker. Only Vite publishes a host port; Vite proxies `/rpc` to Anvil and continues to own `/__anvil/*`, while host Nginx/Certbot exposes the single Vite port over HTTPS. Anvil and its generated deployment manifest share one named volume, so a clean volume deploys once and routine restarts load the same state and addresses.

**Tech Stack:** Docker Engine 29+, Docker Compose v5, Node.js 22, Vite 8, React 19, Foundry/Anvil/Forge 1.7.1, Solidity 0.8.24, Viem/Wagmi, Supabase, host Nginx, Certbot.

## Global Constraints

- This is a disposable academic demo, not a production network.
- Use only Anvil's published default mnemonic/accounts and mock assets; never use real funds, a personal wallet key, or a production deployer/relayer key.
- `.env.local`, `.env.demo`, Supabase service-role credentials, and every other local environment file MUST stay outside all image layers and Git history.
- Keep raw Anvil port `8545` un-published. The browser reaches JSON-RPC only at the same HTTPS origin under `/rpc`.
- Preserve every current `/__anvil/*` route and its signature checks; do not replace the Vite server with a static-only server in this demo.
- The Vite container receives only public browser configuration plus the internal Anvil URL. Only the settlement worker receives `SUPABASE_SERVICE_ROLE_KEY`.
- Keep chain id `80002`, Anvil block time `1`, settlement interval `15000` ms, and the existing `DeployLocal.s.sol` contract graph.
- Pin Foundry to `ghcr.io/foundry-rs/foundry@sha256:8347b728d5d393dac1c018691b36f506d23b9dcd78341d40ea0fcb11c3a19cdd` and Node to `node@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`.
- Install the currently verified Foundry dependencies by immutable commit: `foundry-rs/forge-std@467ffd422ca01fed5797a4c766a1e4e3a5327902` and `OpenZeppelin/openzeppelin-contracts@dc44c9f1a4c3b10af99492eed84f83ed244203f6`.
- Use conventional commits with no co-author or AI attribution.

## Verified Baseline

- `anvil` and `forge` are version `1.7.1`; `anvil --state PATH` loads and dumps one snapshot, and `--state-interval SECONDS` periodically persists it.
- Docker `29.7.2`, Compose `5.4.0`, and the two pinned images above are available.
- `vite-plugin-anvil.js` currently reads only `.env.local`, identifies local mode only from `localhost`/`127.0.0.1`, and registers `/__anvil/*` only through Vite `configureServer`.
- `scripts/_env.mjs` currently throws when `.env.local` is absent; `scripts/settlement-loop.mjs` therefore cannot consume container-injected variables.
- The browser currently embeds `VITE_AMOY_RPC_URL` verbatim and also identifies local mode only from a loopback URL. A remote `/rpc` path would otherwise disable the demo helpers and give MetaMask an invalid relative add-chain URL.
- `contracts/lib`, `contracts/out`, `contracts/cache`, and `contracts/broadcast` are ignored and absent from a clean clone, so the image build must install dependencies itself.
- `DeployLocal.s.sol` deploys, in order, `MockConditionalTokens`, `MockERC20`, `MockFPMMFactory`, `MockSanctionsList`, `MarketFactory`, `ResolutionAdapter`, and `HouseBank`; account 0 is both deployer and relayer.

## Planned File Map

- Create `src/lib/web3/runtime.js` — pure demo-mode and public/internal RPC resolution functions.
- Create `src/lib/web3/__tests__/runtime.test.js` — regression tests for remote HTTPS demo detection and absolute wallet RPC URLs.
- Modify `src/lib/web3/client.js` — configure Wagmi/MetaMask with the absolute same-origin RPC and explicit demo mode.
- Modify `src/lib/web3/localDev.js` — keep helper behavior enabled when `VITE_DEMO_ANVIL=true` even though the public RPC is `/rpc`.
- Modify `src/lib/web3/sendTx.js` — report the configured public RPC instead of instructing remote users to use `127.0.0.1`.
- Modify `scripts/_env.mjs` and `scripts/__tests__/_env.test.mjs` — merge optional `.env.local` data with runtime environment variables, with runtime variables winning.
- Modify `vite-plugin-anvil.js` — reuse the shared loader, use `ANVIL_RPC_URL` internally, and use the explicit demo flag for local-only helpers.
- Modify `vite.config.js` — enable container host/port settings, host allowlisting, disabled HMR, and `/rpc` proxying only in demo mode.
- Create `scripts/demo-bootstrap.mjs` and `scripts/__tests__/demo-bootstrap.test.mjs` — deploy exactly once, verify existing state, and atomically emit the shared manifest.
- Create `scripts/demo-entrypoint.sh` — wait for and source the manifest before starting Vite or the worker.
- Create `.dockerignore`, `Dockerfile`, `docker-compose.yml`, and `.env.demo.example` — reproducible image and four-service runtime.
- Modify `.gitignore` — ignore `.env.demo` and local state backups explicitly.
- Create `deploy/nginx/gg2.conf.template` — one-port host reverse proxy template.
- Create `docs/deployment/disposable-vps-demo.md` — operator runbook, smoke checks, persistence checks, rollback, and teardown.
- Modify `README.md` — point VPS-demo users to the runbook and remove the claim that this demo should use an unfinished Edge settlement path.

---

### Task 1: Make Demo Runtime Detection and Environment Loading Container-Safe

**Files:**
- Create: `src/lib/web3/runtime.js`
- Create: `src/lib/web3/__tests__/runtime.test.js`
- Modify: `src/lib/web3/client.js`
- Modify: `src/lib/web3/localDev.js`
- Modify: `src/lib/web3/sendTx.js`
- Modify: `scripts/_env.mjs`
- Modify: `scripts/__tests__/_env.test.mjs`
- Modify: `vite-plugin-anvil.js`
- Modify: `vite.config.js`

**Interfaces:**
- Produces: `isDemoAnvil(env, rpcUrl) -> boolean`, `resolveBrowserRpcUrl(rawRpcUrl, origin) -> string`, and `resolveInternalRpcUrl(env) -> string` from `src/lib/web3/runtime.js`.
- Produces: `loadEnvLocal(url?, runtimeEnv?) -> Record<string,string>` where the file is optional and `runtimeEnv` overrides file values.
- Consumes: `VITE_DEMO_ANVIL=true`, browser `VITE_AMOY_RPC_URL=/rpc`, server-only `ANVIL_RPC_URL=http://anvil:8545`, `APP_HOST`, and `PORT=3000`.

- [ ] **Step 1: Write the failing browser-runtime tests.**

Create `src/lib/web3/__tests__/runtime.test.js` with these cases:

```js
import { describe, expect, it } from 'vitest'
import { isDemoAnvil, resolveBrowserRpcUrl, resolveInternalRpcUrl } from '../runtime.js'

describe('demo runtime configuration', () => {
  it('keeps Anvil helpers enabled behind a non-loopback proxy path', () => {
    expect(isDemoAnvil({ VITE_DEMO_ANVIL: 'true' }, '/rpc')).toBe(true)
  })

  it('preserves the existing loopback development behavior', () => {
    expect(isDemoAnvil({}, 'http://127.0.0.1:8545')).toBe(true)
    expect(isDemoAnvil({}, 'https://rpc-amoy.polygon.technology')).toBe(false)
  })

  it('turns the same-origin path into an absolute MetaMask RPC URL', () => {
    expect(resolveBrowserRpcUrl('/rpc', 'https://student.idgs8-2.tech')).toBe(
      'https://student.idgs8-2.tech/rpc',
    )
  })

  it('keeps an absolute RPC URL unchanged', () => {
    expect(resolveBrowserRpcUrl('http://127.0.0.1:8545', 'https://student.idgs8-2.tech')).toBe(
      'http://127.0.0.1:8545',
    )
  })

  it('keeps the internal Anvil URL separate from the browser URL', () => {
    expect(resolveInternalRpcUrl({ ANVIL_RPC_URL: 'http://anvil:8545', VITE_AMOY_RPC_URL: '/rpc' })).toBe(
      'http://anvil:8545',
    )
  })
})
```

- [ ] **Step 2: Extend the environment-loader tests before changing the loader.**

Add cases to `scripts/__tests__/_env.test.mjs` that call `loadEnvLocal(missingUrl, runtimeEnv)` and assert that a missing file is allowed, runtime values are returned, and a runtime value overrides the same file key. Pass `{}` in the two existing tests so host process variables cannot make those assertions nondeterministic.

```js
it('uses runtime variables when the local file is absent', () => {
  const missing = pathToFileURL(join(tmpdir(), 'gg2-env-does-not-exist'))
  expect(loadEnvLocal(missing, { VITE_AMOY_RPC_URL: 'http://anvil:8545' })).toEqual({
    VITE_AMOY_RPC_URL: 'http://anvil:8545',
  })
})

it('lets runtime variables override file values', () => {
  const env = withTempEnvFile('RPC=file\nKEEP=file\n', (url) =>
    loadEnvLocal(url, { RPC: 'runtime' }),
  )
  expect(env).toEqual({ RPC: 'runtime', KEEP: 'file' })
})
```

- [ ] **Step 3: Run the focused RED tests.**

Run:

```bash
npm test -- --run src/lib/web3/__tests__/runtime.test.js scripts/__tests__/_env.test.mjs
```

Expected: FAIL because `runtime.js` does not exist and the current loader throws for the missing file.

- [ ] **Step 4: Implement the pure runtime helpers.**

Create `src/lib/web3/runtime.js` with no access to global process state at import time:

```js
const LOOPBACK_RPC = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/i

export function isDemoAnvil(env = {}, rpcUrl = '') {
  return String(env.VITE_DEMO_ANVIL || '').toLowerCase() === 'true' || LOOPBACK_RPC.test(String(rpcUrl))
}

export function resolveBrowserRpcUrl(rawRpcUrl, origin) {
  const rpcUrl = String(rawRpcUrl || '')
  if (!rpcUrl.startsWith('/')) return rpcUrl
  if (!origin) throw new Error('A browser origin is required for a relative RPC URL.')
  return new URL(rpcUrl, origin).href.replace(/\/$/, '')
}

export function resolveInternalRpcUrl(env = {}) {
  return env.ANVIL_RPC_URL || env.VITE_AMOY_RPC_URL || 'http://127.0.0.1:8545'
}
```

- [ ] **Step 5: Make the shared environment loader file-optional and runtime-aware.**

Keep the existing parser semantics, catch only `ENOENT`, and return `{ ...fileEnv, ...runtimeEnv }`. Re-throw permission and parse/read errors. The default remains the root `.env.local`, so workstation behavior stays intact.

```js
export function loadEnvLocal(url = new URL('../.env.local', import.meta.url), runtimeEnv = process.env) {
  let fileEnv = {}
  try {
    const raw = readFileSync(url, 'utf8')
    fileEnv = parseEnvText(raw)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return { ...fileEnv, ...runtimeEnv }
}
```

- [ ] **Step 6: Wire the browser to the proxied RPC without losing local behavior.**

In `src/lib/web3/client.js`, resolve `VITE_AMOY_RPC_URL` against `globalThis.location?.origin`, use `isDemoAnvil(import.meta.env, rpc)` instead of the loopback substring check, disable WalletConnect in demo mode, and pass the absolute URL to Wagmi and `AMOY_ADD_CHAIN.rpcUrls`. In `src/lib/web3/localDev.js`, make `isLocalAnvil()` delegate to the same helper. In `src/lib/web3/sendTx.js`, interpolate `AMOY_RPC_URL` in both MetaMask correction messages instead of hard-coding `http://127.0.0.1:8545`.

- [ ] **Step 7: Make the Vite plugin consume runtime variables and explicit demo mode.**

Delete the duplicate parser in `vite-plugin-anvil.js`. Import `loadEnvLocal`, `isDemoAnvil`, and `resolveInternalRpcUrl`; load `pathToFileURL(resolve(root, '.env.local'))` plus `process.env`; choose the internal `ANVIL_RPC_URL`; and gate every existing local-only route with `isDemoAnvil(env, url)`. Do not change route names, bodies, signature verification, impersonation cleanup, or the synchronous Connect middleware wrapper.

- [ ] **Step 8: Add the container-only Vite server settings.**

In `vite.config.js`, compute `demoMode` from `process.env.VITE_DEMO_ANVIL === 'true'`. Preserve the current workstation settings when false. When true, set host `0.0.0.0`, port `Number(process.env.PORT || 3000)`, `strictPort: true`, `allowedHosts: [process.env.APP_HOST]` after rejecting an empty `APP_HOST`, `hmr: false`, and this proxy:

```js
proxy: demoMode
  ? {
      '/rpc': {
        target: process.env.ANVIL_RPC_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, '') || '/',
      },
    }
  : undefined
```

Fail config loading when demo mode is true but `ANVIL_RPC_URL`, `APP_HOST`, or `PORT` is absent. This prevents a container from silently falling back to Polygon Amoy or binding the wrong port.

- [ ] **Step 9: Run the GREEN tests and the full frontend gate.**

Run:

```bash
npm test -- --run src/lib/web3/__tests__/runtime.test.js scripts/__tests__/_env.test.mjs
npm run lint
npm test -- --run
npm run build
```

Expected: focused and full Vitest suites PASS, lint exits `0`, and Vite creates `dist/` successfully.

- [ ] **Step 10: Commit the runtime boundary.**

```bash
git add src/lib/web3/runtime.js src/lib/web3/__tests__/runtime.test.js \
  src/lib/web3/client.js src/lib/web3/localDev.js src/lib/web3/sendTx.js \
  scripts/_env.mjs scripts/__tests__/_env.test.mjs vite-plugin-anvil.js vite.config.js
git commit -m "feat: support proxied Anvil demo runtime"
```

**Rollback boundary:** Revert this commit as one unit. Do not keep `/rpc` Compose routing while reverting explicit demo detection, because the browser would treat the demo as Polygon Amoy and bypass `/__anvil/*`.

---

### Task 2: Bootstrap Contracts Once and Share Their Runtime Manifest

**Files:**
- Create: `scripts/demo-bootstrap.mjs`
- Create: `scripts/__tests__/demo-bootstrap.test.mjs`
- Create: `scripts/demo-entrypoint.sh`

**Interfaces:**
- Consumes: `ANVIL_RPC_URL`, `DEMO_STATE_DIR`, Foundry's `forge` binary, and `contracts/script/DeployLocal.s.sol`.
- Produces: `${DEMO_STATE_DIR}/public.env` (mode `0644`) with the six `VITE_*_ADDRESS` keys and `${DEMO_STATE_DIR}/settlement.env` (mode `0600`) with only `VITE_RESOLUTION_ADAPTER_ADDRESS`, `VITE_HOUSE_BANK_ADDRESS`, and `RELAYER_PRIVATE_KEY`; both are atomically renamed from `.tmp` files.
- Exit contract: `0` only after all six addresses contain deployed bytecode on chain `80002`; nonzero on partial state, unexpected nonce, malformed Forge output, or verification failure.

- [ ] **Step 1: Write the failing parser and manifest tests.**

Create `scripts/__tests__/demo-bootstrap.test.mjs` and import only exported pure functions; the module main guard must prevent deployment during import.

```js
import { describe, expect, it } from 'vitest'
import { parseDeployAddresses, renderPublicManifest, renderSettlementManifest } from '../demo-bootstrap.mjs'

const forgeOutput = `
CTF_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
FPMM_FACTORY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
MARKET_FACTORY_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
RESOLUTION_ADAPTER_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
HOUSE_BANK_ADDRESS=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
`

it('extracts every DeployLocal address', () => {
  expect(parseDeployAddresses(forgeOutput)).toMatchObject({
    VITE_MARKET_FACTORY_ADDRESS: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    VITE_HOUSE_BANK_ADDRESS: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
  })
})

it('rejects incomplete Forge output', () => {
  expect(() => parseDeployAddresses('USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512')).toThrow(
    /missing deployment addresses/i,
  )
})

it('keeps the public manifest free of the relayer key', () => {
  const addresses = parseDeployAddresses(forgeOutput)
  expect(renderPublicManifest(addresses)).not.toContain('RELAYER_PRIVATE_KEY')
  expect(renderPublicManifest(addresses)).toContain('VITE_HOUSE_BANK_ADDRESS=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853')
  expect(renderSettlementManifest(addresses)).toContain(
    'RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  )
})
```

- [ ] **Step 2: Run the bootstrap RED test.**

Run:

```bash
npm test -- --run scripts/__tests__/demo-bootstrap.test.mjs
```

Expected: FAIL because `scripts/demo-bootstrap.mjs` does not exist.

- [ ] **Step 3: Implement the bootstrap state machine.**

Implement `scripts/demo-bootstrap.mjs` with these exact states:

1. Poll `eth_chainId` for at most 60 seconds and require `0x13882`.
2. If both `public.env` and `settlement.env` exist, parse them with `loadEnvLocal(pathToFileURL(manifestPath), {})`, require all six public addresses, call `eth_getCode` for each, reject `0x`, and exit `0` without running Forge. If only one manifest exists, fail as partial state.
3. If no manifest exists, call `eth_getTransactionCount` for `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` at `latest` and require `0x0`. A nonzero nonce without a manifest is partial/corrupt bootstrap state and MUST fail instead of deploying a second address set.
4. Spawn exactly:

```text
forge script ./script/DeployLocal.s.sol --root ./contracts --rpc-url http://anvil:8545 --broadcast
```

5. Parse the six anchored `*_ADDRESS=0x...` lines and verify bytecode for every address. Atomically write `public.env` with only six public addresses and `settlement.env` with the adapter/house addresses plus the published Anvil account-0 key. Never put `RELAYER_PRIVATE_KEY` in `public.env`.
6. Log JSON events `demo-bootstrap.waiting`, `demo-bootstrap.deployed`, `demo-bootstrap.reused`, and `demo-bootstrap.failed` without logging Supabase credentials.

Export `parseDeployAddresses`, `renderPublicManifest`, `renderSettlementManifest`, and `main`. Run `main()` only when `import.meta.url === pathToFileURL(process.argv[1]).href`.

- [ ] **Step 4: Add the manifest-waiting entrypoint.**

Create executable `scripts/demo-entrypoint.sh`:

```sh
#!/bin/sh
set -eu

manifest="${DEMO_STATE_DIR:-/demo-state}/${DEMO_MANIFEST:?DEMO_MANIFEST is required}"
attempt=0
while [ ! -s "$manifest" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 60 ]; then
    echo "demo-entrypoint: deployment manifest not ready after 60 seconds" >&2
    exit 1
  fi
  sleep 1
done

set -a
. "$manifest"
set +a
exec "$@"
```

- [ ] **Step 5: Run the GREEN tests and shell validation.**

Run:

```bash
npm test -- --run scripts/__tests__/demo-bootstrap.test.mjs scripts/__tests__/_env.test.mjs
sh -n scripts/demo-entrypoint.sh
test -x scripts/demo-entrypoint.sh
```

Expected: both Vitest files PASS, shell syntax exits `0`, and the executable check exits `0`.

- [ ] **Step 6: Commit the bootstrap unit.**

```bash
git add scripts/demo-bootstrap.mjs scripts/__tests__/demo-bootstrap.test.mjs scripts/demo-entrypoint.sh
git commit -m "feat: bootstrap persistent Anvil demo state"
```

**Rollback boundary:** Revert code only while the chain has not been initialized. After the two manifests exist, preserve the `gg2-demo-state` volume during code rollback; if the reverted deploy script is incompatible with that state, explicitly reset the disposable volume rather than redeploying into the existing chain.

---

### Task 3: Build the Reproducible Four-Service Compose Topology

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.demo.example`
- Modify: `.gitignore`

**Interfaces:**
- `anvil`: internal port `8545`, chain `80002`, persistent `/demo-state/anvil-state.json`; no host port.
- `bootstrap`: one-shot service that writes `/demo-state/public.env` and `/demo-state/settlement.env`, then exits successfully.
- `app`: internal port `3000`, only published port `127.0.0.1:${APP_PORT}:3000`.
- `settlement`: no published port; reads Supabase and submits `postResult -> settle -> claim` to Anvil.
- Named volume: exact Docker name `gg2-demo-state`.
- Networks: `demo-backend` is internal; app, bootstrap, and settlement also join the default egress network where required.

- [ ] **Step 1: Add image-context exclusions before writing the Dockerfile.**

Create `.dockerignore` that excludes `.git`, `.codegraph`, `.atl`, `.env`, `.env.*`, `node_modules`, `dist`, coverage/browser artifacts, logs, `contracts/lib`, `contracts/out`, `contracts/cache`, `contracts/broadcast`, and local backup archives; explicitly re-include `.env.example` and `.env.demo.example`. Add `.env.demo` and `backups/` to `.gitignore`.

- [ ] **Step 2: Create the pinned multi-stage Dockerfile.**

Use the Foundry digest as a `foundry` stage and the Node digest as the final stage. Add an `anvil` target derived from `foundry` that creates `/demo-state` owned by uid `1000`, restores user `foundry`, and sets JSON entrypoint `["anvil"]`; this avoids the upstream image's shell entrypoint and lets the named volume initialize with non-root ownership. The Foundry build stage copies `contracts/`, installs both immutable dependency commits with `forge install --no-git`, runs `forge build`, and leaves a complete clean-clone contract workspace. The Node stage runs `npm ci`, copies application source, copies `/usr/local/bin/forge` and `/usr/local/bin/cast` from Foundry, copies the built contract workspace, creates `/demo-state` owned by uid `1000`, switches to user `node`, exposes `3000`, and uses `scripts/demo-entrypoint.sh` as its entrypoint.

The dependency command must be:

```dockerfile
RUN forge install --no-git \
      foundry-rs/forge-std@467ffd422ca01fed5797a4c766a1e4e3a5327902 \
      OpenZeppelin/openzeppelin-contracts@dc44c9f1a4c3b10af99492eed84f83ed244203f6 \
    && forge build
```

Do not use `ARG` or `ENV` for Supabase credentials or any private runtime value.

- [ ] **Step 3: Create a fail-closed runtime environment template.**

Create `.env.demo.example` with documented, deliberately empty operator-supplied values:

```dotenv
# University DNS name and assigned 30XX port. Compose rejects empty values.
APP_HOST=
APP_PORT=

# Existing Supabase project. The anon key reaches the browser; the service role reaches only settlement.
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Do not include deployer keys, relayer keys, contract addresses, or `.env.local` content. The bootstrap writes the public Anvil development relayer key and fresh addresses into the private named volume.

- [ ] **Step 4: Create `docker-compose.yml`.**

Define these service policies:

```yaml
services:
  anvil:
    build:
      context: .
      target: anvil
    command:
      - --chain-id
      - "80002"
      - --host
      - 0.0.0.0
      - --port
      - "8545"
      - --block-time
      - "1"
      - --accounts
      - "10"
      - --state
      - /demo-state/anvil-state.json
      - --state-interval
      - "1"
    volumes:
      - demo-state:/demo-state
    networks: [demo-backend]
    restart: unless-stopped
    stop_grace_period: 30s
    healthcheck:
      test: ["CMD", "cast", "chain-id", "--rpc-url", "http://127.0.0.1:8545"]
      interval: 3s
      timeout: 2s
      retries: 20
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]

  bootstrap:
    build: .
    entrypoint: ["node", "scripts/demo-bootstrap.mjs"]
    environment:
      ANVIL_RPC_URL: http://anvil:8545
      DEMO_STATE_DIR: /demo-state
    volumes:
      - demo-state:/demo-state
    networks: [default, demo-backend]
    depends_on:
      anvil:
        condition: service_healthy
    restart: "no"
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]

  app:
    build: .
    command: ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
    environment:
      NODE_ENV: production
      PORT: "3000"
      APP_HOST: ${APP_HOST:?APP_HOST is required}
      DEMO_MANIFEST: public.env
      ANVIL_RPC_URL: http://anvil:8545
      VITE_AMOY_RPC_URL: /rpc
      VITE_DEMO_ANVIL: "true"
      VITE_FEATURE_WEB3: "true"
      VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}
      VITE_SUPABASE_ANON_KEY: ${VITE_SUPABASE_ANON_KEY:?VITE_SUPABASE_ANON_KEY is required}
    ports:
      - "127.0.0.1:${APP_PORT:?APP_PORT is required}:3000"
    volumes:
      - demo-state:/demo-state:ro
    networks: [default, demo-backend]
    depends_on:
      bootstrap:
        condition: service_completed_successfully
    restart: unless-stopped
    init: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/__anvil/status',{method:'POST'}).then(r=>{if(!r.ok)process.exit(1)})"]
      interval: 10s
      timeout: 3s
      retries: 12

  settlement:
    build: .
    command: ["npm", "run", "settle:loop"]
    environment:
      NODE_ENV: production
      DEMO_MANIFEST: settlement.env
      ANVIL_RPC_URL: http://anvil:8545
      VITE_AMOY_RPC_URL: http://anvil:8545
      VITE_DEMO_ANVIL: "true"
      VITE_SUPABASE_URL: ${VITE_SUPABASE_URL:?VITE_SUPABASE_URL is required}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}
      SETTLEMENT_INTERVAL_MS: "15000"
    volumes:
      - demo-state:/demo-state:ro
    networks: [default, demo-backend]
    depends_on:
      bootstrap:
        condition: service_completed_successfully
    restart: unless-stopped
    init: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]

volumes:
  demo-state:
    name: gg2-demo-state

networks:
  demo-backend:
    internal: true
```

The app environment MUST NOT contain `SUPABASE_SERVICE_ROLE_KEY` or `RELAYER_PRIVATE_KEY`. The two-manifest contract from Task 2 ensures only settlement sources the published Anvil relayer key.

- [ ] **Step 5: Validate Compose with harmless synthetic values.**

Run:

```bash
APP_HOST=student.idgs8-2.tech \
APP_PORT=3099 \
VITE_SUPABASE_URL=https://example.supabase.co \
VITE_SUPABASE_ANON_KEY=demo-anon \
SUPABASE_SERVICE_ROLE_KEY=demo-service-role \
docker compose config --quiet
```

Expected: exit `0`, exactly one published port on `app`, and no `ports` entry under `anvil`, `bootstrap`, or `settlement`.

- [ ] **Step 6: Prove the clean-clone image build does not rely on ignored files.**

Run:

```bash
test -z "$(git ls-files contracts/lib contracts/out contracts/cache contracts/broadcast)"
docker build --no-cache --tag gg2-demo:plan-check .
docker run --rm --entrypoint sh gg2-demo:plan-check -c \
  'test ! -e /app/.env.local && test ! -e /app/.env.demo && forge build --root /app/contracts'
```

Expected: all commands exit `0`; Forge installs/builds from the pinned commits inside the image, and neither environment file exists in the image.

- [ ] **Step 7: Commit the container topology.**

```bash
git add .dockerignore Dockerfile docker-compose.yml .env.demo.example .gitignore \
  scripts/demo-bootstrap.mjs scripts/__tests__/demo-bootstrap.test.mjs scripts/demo-entrypoint.sh
git commit -m "ops: add disposable VPS Compose stack"
```

**Rollback boundary:** This commit owns image composition, service privilege boundaries, and volume layout together. Revert them together. Never publish `8545` as a rollback shortcut.

---

### Task 4: Add One-Port Nginx/HTTPS Operations and Demo Lifecycle Documentation

**Files:**
- Create: `deploy/nginx/gg2.conf.template`
- Create: `docs/deployment/disposable-vps-demo.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `.env.demo` values `APP_HOST` and `APP_PORT`.
- Produces: `/etc/nginx/sites-available/gg2` and `/etc/nginx/sites-enabled/gg2` on the VPS.
- Public URLs: `https://${APP_HOST}/`, `https://${APP_HOST}/__anvil/status`, and `https://${APP_HOST}/rpc`.

- [ ] **Step 1: Add the exact host Nginx template.**

Create `deploy/nginx/gg2.conf.template`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_HOST};

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }
}
```

There is intentionally no separate Nginx upstream for Anvil: `/rpc` reaches the same Vite port, and Vite proxies it over the private Docker network.

- [ ] **Step 2: Write the clean VPS launch procedure.**

In `docs/deployment/disposable-vps-demo.md`, document these commands in order:

```bash
cp .env.demo.example .env.demo
chmod 600 .env.demo
# Fill the five required values with the university DNS/port and the existing Supabase project values.
docker compose --env-file .env.demo config --quiet
docker compose --env-file .env.demo up --build --detach
docker compose --env-file .env.demo ps
docker compose --env-file .env.demo logs bootstrap
docker compose --env-file .env.demo logs settlement
```

Require `bootstrap` to be `Exited (0)`, `anvil` and `app` to be healthy, and settlement logs to contain `settlement-loop.started` before configuring Nginx.

- [ ] **Step 3: Document exact Nginx and Certbot activation.**

Use restricted `envsubst` so Nginx's own `$host` variables remain intact:

```bash
set -a
. ./.env.demo
set +a
envsubst '${APP_HOST} ${APP_PORT}' < deploy/nginx/gg2.conf.template | \
  sudo tee /etc/nginx/sites-available/gg2 >/dev/null
sudo ln -sfn /etc/nginx/sites-available/gg2 /etc/nginx/sites-enabled/gg2
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d "$APP_HOST"
sudo nginx -t
sudo systemctl reload nginx
```

- [ ] **Step 4: Document browser/RPC smoke checks.**

Use exact JSON-RPC and helper requests:

```bash
curl --fail --silent --show-error "https://${APP_HOST}/" >/dev/null
curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "https://${APP_HOST}/rpc"
curl --fail --silent --show-error \
  -X POST -H 'content-type: application/json' --data '{}' \
  "https://${APP_HOST}/__anvil/status"
```

Expected RPC result: `0x13882`. Expected helper body: `{"ok":true,"chainId":80002,"local":true}`. Also run `ss -ltn` and assert that the assigned loopback port is listening while `0.0.0.0:8545`, `[::]:8545`, and `127.0.0.1:8545` are absent on the host.

- [ ] **Step 5: Document the fake-wallet review flow.**

Tell the reviewer to create a fresh browser profile, import only Anvil account 1 using the public development key `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`, and add chain `80002` with RPC `https://${APP_HOST}/rpc`. State prominently that this key is publicly known, must never receive real assets, and the profile should be deleted with the demo.

- [ ] **Step 6: Document restart persistence verification.**

Capture the HouseBank code and latest block, restart ordinary services, and compare:

```bash
before_code=$(docker compose --env-file .env.demo exec -T app sh -lc \
  '. /demo-state/public.env; cast code "$VITE_HOUSE_BANK_ADDRESS" --rpc-url http://anvil:8545')
before_block=$(curl --silent -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  "https://${APP_HOST}/rpc")
docker compose --env-file .env.demo restart anvil app settlement
docker compose --env-file .env.demo ps
docker compose --env-file .env.demo run --rm bootstrap
after_code=$(docker compose --env-file .env.demo exec -T app sh -lc \
  '. /demo-state/public.env; cast code "$VITE_HOUSE_BANK_ADDRESS" --rpc-url http://anvil:8545')
test "$before_code" = "$after_code"
test "$after_code" != "0x"
printf '%s\n%s\n' "$before_block" \
  "$(curl --silent -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' "https://${APP_HOST}/rpc")"
```

Expected: bootstrap logs `demo-bootstrap.reused`, contract bytecode is identical/nonempty, and the post-restart block number is not reset to genesis.

- [ ] **Step 7: Document backup, code rollback, state reset, and final teardown.**

Backup before changing images:

```bash
mkdir -p backups
docker compose --env-file .env.demo stop anvil
docker run --rm --user 0:0 \
  -v gg2-demo-state:/source:ro -v "$PWD/backups:/backup" \
  node@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 \
  sh -c 'tar -C /source -czf /backup/gg2-demo-state.tgz .'
docker compose --env-file .env.demo start anvil
```

Rollback code by checking out/reverting the last known-good atomic commit and running `docker compose --env-file .env.demo up --build --detach`; keep `gg2-demo-state` only when the contract/runtime manifest remains compatible. Reset the disposable chain deliberately with:

```bash
docker compose --env-file .env.demo down
docker volume rm gg2-demo-state
docker compose --env-file .env.demo up --build --detach
```

Final post-review teardown removes application data, TLS routing, and the throwaway browser profile:

```bash
docker compose --env-file .env.demo down --volumes --remove-orphans
sudo rm -f /etc/nginx/sites-enabled/gg2 /etc/nginx/sites-available/gg2
sudo nginx -t
sudo systemctl reload nginx
rm -f .env.demo
rm -rf backups
```

- [ ] **Step 8: Update the README deployment boundary.**

Keep the current local-development instructions. Add a short “Disposable university VPS demo” section linking to `docs/deployment/disposable-vps-demo.md`, stating that it deliberately serves Vite middleware and proxied Anvil admin RPC, is not production-ready, and uses the Compose settlement worker rather than the unfinished Supabase Edge `settlement-tick` path.

- [ ] **Step 9: Structurally verify and commit the runbook.**

Run:

```bash
grep -F 'proxy_pass http://127.0.0.1:${APP_PORT};' deploy/nginx/gg2.conf.template
grep -F 'docker compose --env-file .env.demo down --volumes --remove-orphans' docs/deployment/disposable-vps-demo.md
grep -F 'docs/deployment/disposable-vps-demo.md' README.md
git diff --check
```

Expected: all checks exit `0` and `git diff --check` prints nothing.

Commit:

```bash
git add deploy/nginx/gg2.conf.template docs/deployment/disposable-vps-demo.md README.md
git commit -m "docs: add disposable VPS demo runbook"
```

**Rollback boundary:** Remove the Nginx enabled-site symlink and reload Nginx before reverting the documentation/config commit. Certbot certificate deletion is optional until final teardown, but traffic must stop reaching the demo first.

---

### Task 5: Run the Final Candidate Verification

**Files:**
- Verify only; do not mutate source after this point.

**Interfaces:**
- Consumes: all four atomic work units and a completed `.env.demo` on the disposable VPS.
- Produces: reproducible evidence that source tests, contracts, images, privilege boundaries, one-port routing, bootstrap, settlement, and persistence all work together.

- [ ] **Step 1: Run source and contract gates.**

```bash
npm ci
npm run lint
npm test -- --run
npm run build
forge test --root contracts
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 2: Validate the rendered Compose security boundary.**

```bash
docker compose --env-file .env.demo config > /tmp/gg2-compose.rendered.yml
grep -n '127.0.0.1:' /tmp/gg2-compose.rendered.yml
! grep -nE 'published: "?8545|0\.0\.0\.0:.*8545' /tmp/gg2-compose.rendered.yml
docker compose --env-file .env.demo config --environment | grep -E '^(APP_HOST|APP_PORT)='
```

Expected: only the app's assigned loopback port is published; raw Anvil is absent.

- [ ] **Step 3: Rebuild and launch from the committed candidate.**

```bash
docker compose --env-file .env.demo build --no-cache
docker compose --env-file .env.demo up --detach
docker compose --env-file .env.demo ps
docker compose --env-file .env.demo logs --no-color bootstrap app settlement
```

Expected: bootstrap completes once, app is healthy, settlement stays running, and neither process reports missing environment keys.

- [ ] **Step 4: Prove secret separation from images and the Vite service.**

```bash
image_id=$(docker compose --env-file .env.demo images --quiet app)
docker run --rm --entrypoint sh "$image_id" -c \
  'test ! -e /app/.env.local && test ! -e /app/.env.demo'
docker compose --env-file .env.demo exec -T app sh -lc \
  'test -z "${SUPABASE_SERVICE_ROLE_KEY:-}" && test -z "${RELAYER_PRIVATE_KEY:-}"'
docker compose --env-file .env.demo exec -T settlement sh -lc \
  'test -n "$SUPABASE_SERVICE_ROLE_KEY" && test -n "$RELAYER_PRIVATE_KEY"'
```

Expected: all checks exit `0`; secrets exist only where explicitly required at runtime.

- [ ] **Step 5: Repeat HTTPS, `/__anvil/*`, `/rpc`, and restart-persistence checks from Task 4.**

Expected: the page loads from a remote browser, MetaMask accepts the HTTPS RPC for chain `80002`, helper status reports local mode, settlement logs ticks, and HouseBank bytecode/state survive restart.

- [ ] **Step 6: Record the delivery boundary.**

Tag or record the four commit hashes from Tasks 1–4 in the deployment notes. The rollback order is: disable Nginx traffic, restore the prior code/image commit, restore the volume archive only if the state schema changed, then re-enable traffic after the full smoke check. Do not create a fifth source commit for verification-only output.

## Atomic Commit and Rollback Summary

1. `feat: support proxied Anvil demo runtime` — browser/server runtime contract; revert only with `/rpc` routing removed.
2. `feat: bootstrap persistent Anvil demo state` — deployment state machine and manifest; revert before initialization or preserve/reset the volume deliberately.
3. `ops: add disposable VPS Compose stack` — image, service isolation, single port, and volume; revert as one operational unit and never expose `8545`.
4. `docs: add disposable VPS demo runbook` — host Nginx/Certbot and lifecycle operations; disable the Nginx site before rollback.

## Risk Register

- **Accepted, critical outside this demo:** `/rpc` exposes Anvil's administrative JSON-RPC through HTTPS and `/__anvil/*` performs privileged fake-chain actions. The only safe lifetime is the short university review window followed by complete teardown.
- **State durability:** Anvil JSON state is sufficient for ordinary restarts, not for production durability. A hard kill between deployment and the next one-second state flush can leave a manifest/state mismatch; bootstrap must fail closed and the operator must restore the archive or reset the disposable volume.
- **Vite dev server:** Keeping Vite is required for `/__anvil/*`, but it is not a hardened production static server. Host allowlisting, Nginx's request-size limit, loopback publication, no HMR, and short lifetime reduce rather than eliminate exposure.
- **Supabase service role:** Compromise of the settlement container exposes the existing service-role key. Keep it out of the app environment/image, rotate it after the review if the VPS is not fully trusted, and remove `.env.demo` during teardown.
- **Dependency/network bootstrap:** The first image build needs GitHub/GHCR access to fetch pinned Foundry libraries and base images. The commits/digests make content deterministic but do not remove that availability dependency.
- **Remote wallet caching:** MetaMask may retain an older chain-80002 RPC. The clean browser-profile procedure prevents accidentally pointing the demo at public Amoy or retaining the public Anvil RPC afterward.

## Plan Self-Review

- **Coverage:** Every approved requirement maps to a task: Compose/Vite/Anvil/worker in Task 3, `/__anvil/*` and remote browser RPC in Task 1, bootstrap and restart persistence in Tasks 2–4, one-port Nginx/HTTPS in Task 4, and fake-key/no-secret constraints in Tasks 2–5.
- **Ambiguity:** Runtime variable names, service names, ports, image digests, dependency commits, manifest keys, health criteria, commands, commit messages, and rollback actions are explicit. University-specific DNS, assigned port, and Supabase values are intentionally operator inputs enforced by Compose rather than guessed values.
- **Consistency:** Browser RPC is `/rpc`, wallet RPC is its absolute HTTPS form, server RPC is `http://anvil:8545`, chain id is always `80002`, and only the app publishes `127.0.0.1:${APP_PORT}:3000`.
- **Security:** The final design uses separate public and settlement manifests so the Vite service never receives the relayer key; `.dockerignore`, runtime-only Compose interpolation, and final image/environment checks protect `.env.local` and the service-role key.
- **Test discipline:** Each behavioral change starts with a focused failing Vitest case, then focused GREEN verification, full source/contract gates, Docker configuration/build checks, HTTPS smoke checks, secret-boundary assertions, and restart persistence proof.
