# TorneoApuestas — Fighting Games Tournament Platform & P2P Prediction Markets

A production-ready esports tournament and prediction-market platform. Built with React 19 + Vite, backed by Supabase (Postgres + Row-Level Security + Auth + Edge Functions), Solidity contracts (Foundry + Gnosis Conditional Tokens Framework on Polygon Amoy), and wagmi/viem.

- **Tournament Engine**: Automatic ingestion of esports tournaments from the **start.gg** API (filtered by region/game), automated bracket lifecycle, official results, and player Elo ratings.
- **P2P Prediction Markets**: Non-custodial prediction markets on Polygon Amoy testnet using USDC collateral and Gnosis CTF. Includes permissionless market creation, relayer result posting, challenge windows, bond accounting, and multisig arbitration.
- **Identity & Security**: Supabase Auth with Google OAuth, atomic case-insensitive `@username` claim, optional 1:1 SIWE wallet linking, and strict RLS database grants.

---

## 🛠️ Environment and Setup Contract

Copy `.env.example` to `.env.local` (git-ignored) and fill in your Supabase & Web3 variables. **Never commit a real `.env` or service-role key.**

### Client Environment Variables (Vite, `VITE_*`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | **Yes** | — | Public Supabase project URL (`https://<project_ref>.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | — | Public anon API key for client-side Supabase calls. |
| `VITE_FEATURE_WEB3` | No | `false` | Set to `true` to enable the on-chain Web3 prediction markets, wallet connection, `/mercados/nuevo` route, and admin panel. |
| `VITE_FEATURE_IDENTITY` | No | `true` | Set to `false` to emergency-disable the Supabase identity adapter. |
| `VITE_FEATURE_TOURNAMENTS` | No | `true` | Set to `false` to emergency-disable the tournament/bracket adapter. |
| `VITE_FEATURE_RATINGS` | No | `true` | Set to `false` to emergency-disable the ratings/leaderboard adapter. |
| `VITE_MARKET_FACTORY_ADDRESS` | No | Amoy default | Address of deployed `MarketFactory.sol` on Polygon Amoy. |
| `VITE_RESOLUTION_ADAPTER_ADDRESS` | No | Amoy default | Address of deployed `ResolutionAdapter.sol` on Polygon Amoy. |
| `VITE_USDC_ADDRESS` | No | Amoy default | Testnet USDC ERC-20 token address on Polygon Amoy. |
| `VITE_CTF_ADDRESS` | No | Amoy default | Gnosis `ConditionalTokens` singleton contract address on Polygon Amoy. |

---

## 🔑 Google OAuth Setup (Supabase + Google Cloud)

To enable Google sign-in locally and in production:

1. **Google Cloud Console**:
   - Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
   - Create an **OAuth 2.0 Client ID** (Web application).
   - Add Authorized Redirect URI: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`

2. **Supabase Dashboard**:
   - Go to **Authentication -> Providers -> Google**.
   - Enable Google and paste your Client ID and Client Secret.
   - Go to **Authentication -> URL Configuration**:
     - Set **Site URL**: `http://localhost:5173/`
     - Add to **Redirect URLs**: `http://localhost:5173/` and `http://localhost:5173`

---

## ⛽ Polygon Amoy Testnet (Free Testing)

All Web3 transactions run on the **Polygon Amoy Testnet** using free test tokens.

1. **Get Testnet POL (Gas)**:
   - Visit the official [Polygon Faucet](https://faucet.polygon.technology/) or [Alchemy Amoy Faucet](https://alchemy.com/faucets/polygon-amoy).
   - Enter your wallet address to receive free test POL for gas fees.
2. **Connect Wallet**:
   - Open your browser with a wallet extension (**MetaMask**, **Rabby**, or **Coinbase Wallet**).
   - Set network to **Polygon Amoy Testnet** (Chain ID `80002`).

---

## 💻 Local Development

```bash
npm ci                 # Frozen install
npm run dev             # Start Vite development server (http://localhost:5173)
npm run lint            # Run oxlint linter
npm run test            # Run Vitest unit & repository test suite
npm run build           # Production bundle build
npm run preview         # Preview local production build (http://localhost:4173)
```

---

## 🧪 Testing Architecture & CI Pipeline

The project enforces a 100% passing 9-job CI gate chain in `.github/workflows/ci.yml`:

| Layer | Command | Scope & Coverage |
|---|---|---|
| **Unit & Repositories** | `npm run test` | Vitest + React Testing Library + V8 coverage (81.6%+ lines). |
| **Postgres / pgTAP** | `npm run test:db` (`supabase test db`) | 16 pgTAP suites (144 assertions) covering RLS deny-by-default, RPC idempotency, username claim race, security alerts, and wallet cache. |
| **End-to-End** | `npm run test:e2e` (`playwright test`) | 25 Playwright specs covering OAuth sign-in, tournament lifecycle, rating history, routing threat matrix, and Web3 flag gates. |
| **Solidity Fuzzing** | `forge test --fuzz-runs 256` | Foundry fuzzing & invariant suite for `MarketFactory.sol` and `ResolutionAdapter.sol`. |
| **Solidity Static Analysis** | `slither` | Slither security analysis for reentrancy, access control, and state integrity in `contracts/`. |
| **Quality & Audit** | `oxlint`, `npm audit` | Code style enforcement and dependency vulnerability scanning. |

---

## 🏛️ Architecture Overview

```
                        ┌─────────────────────────┐
                        │      React 19 SPA       │
                        │ (Vite + Router + Wagmi) │
                        └────────────┬────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│   Supabase Auth    │    │  Supabase Postgres │    │  Polygon Amoy CTF  │
│  (Google + Profile)│    │  (RLS + RPCs + DB) │    │(MarketFactory.sol) │
└────────────────────┘    └────────────────────┘    └────────────────────┘
                                     ▲                         ▲
                                     │                         │
                          ┌──────────┴──────────┐   ┌──────────┴──────────┐
                          │   Edge Functions    │   │  Relayer / Indexer  │
                          │   (startgg-poller)  │   │  (Deno + Viem)      │
                          └─────────────────────┘   └─────────────────────┘
```

- **Database RLS**: Every table uses strict Row-Level Security with explicit `REVOKE ALL` and role-based policy grants.
- **Idempotency**: All state-modifying RPCs require a `p_request_id` to enforce at-most-once execution under retries.
- **Append-only Audit**: Sensitive actions and migration events emit immutable audit records in `audit_events`, `migration_events`, and `security_alerts`.

---

## 📜 License

MIT License.
