# COLISEUM — README 2.1

Plataforma de torneos de fighting games (start.gg) + apuestas parimutuel on-chain. El frontend es React 19 / Vite. La casa de apuestas vive en el contrato `HouseBank` sobre un Anvil local que se hace pasar por Polygon Amoy (chain id `80002`).

Este documento describe el producto **como está hoy**: casa, límites, MetaMask, i18n, liquidación automática.

---

## Qué es esto ahora

- Importa torneos y sets reales desde **start.gg** (`startgg-poller`, corre solo cada minuto vía `pg_cron` — no hace falta dispararlo a mano).
- Cada set trackeado trae un link directo al torneo en start.gg.
- En cada partido (set) se puede abrir una **línea**: ¿quién gana?
- El dinero no sale de MetaMask a cada apuesta. Primero **recargás el saldo de la casa**. Ese depósito **no se retira**: se apuesta. Solo se pueden sacar **ganancias**. El saldo disponible para apostar también se ve en el header, junto al botón de Billetera.
- Dos cuentas de Google en la misma wallet **no comparten** saldo ni apuestas (`keccak256(wallet, accountId)`).
- Idioma por defecto: **español latino**. Arriba a la derecha: **ES | EN**.

No es un bookmaker con momio fijo. Es **parimutuel**: el pago depende de cuánto hay en cada lado.

---

## Cómo se apuesta

1. Iniciá sesión con Google.
2. Conectá MetaMask a la red **80002** con RPC `http://127.0.0.1:8545`.
3. En **Billetera → Agregar fondos** recargá USDC a la casa. MetaMask pide **confirmar una transacción**.
4. En el torneo, apostá a un jugador. Un solo lado por cuenta.
5. En la línea ves dos recuadros:
   - **Tu apuesta** (ya hecha): invertido, ganancia y **si gana cobras apuesta + ganancia**.
   - **Si sumas ahora**: estimación de una apuesta nueva al mismo jugador.

### Límites (para que, si ganás, no pierdas por el 5%)

| Regla | Valor |
|---|---|
| Primera apuesta (lado vacío) | máximo **100 USDC** |
| Mínimo | **1 USDC** |
| Tope al cubrir / sumar | crece con lo apostado **en el otro lado** |
| Mínimo al cubrir | alcanza para que el lado contrario también tenga ganancia si gana |
| Comisión de la casa | **5% del pozo**, solo si hay dinero en **los dos** lados al liquidar |
| Un lado vacío al liquidar | **no hay 5%**; se devuelve el **100%** |
| Cancelar apuesta | **10 minutos** después de hacerla, y solo si el mercado todavía no se liquidó |

No se puede abrir con 5000 USDC ni cubrir 5000 con 10. El rango **mín. / máx.** se muestra en cada lado.

---

## Liquidación: cómo se cobra

Cuando un set termina, la plata **no se acredita sola** en el instante — hace falta que el pipeline de liquidación corra la secuencia completa:

1. `postResult` — se publica el resultado en `ResolutionAdapter`, tomado directo de `tournament_sets.winner_startgg_id` (lo que ya trajo el poller de start.gg). Sin intervención humana.
2. Pasa la ventana de disputa (`CHALLENGE_WINDOW`, 4 horas en el contrato).
3. `settle` — finaliza el resultado.
4. `HouseBank.claim(questionId)` — acredita a **todos** los ganadores de ese mercado de una sola llamada. Los perdedores no cobran.

### Corriendo esto en local (dev)

Supabase (nube) no puede llegar a tu Anvil local (`127.0.0.1:8545`), así que la liquidación automática hoy corre como un **script local**, no como cron de Supabase:

```bash
npm run settle:loop
```

Dejalo corriendo en una terminal aparte (junto a `anvil`). Cada 15s revisa los sets `COMPLETED` con mercado activo y avanza cada uno por `postResult` → `settle` → `claim` según corresponda. Necesita `.env.local` con `RELAYER_PRIVATE_KEY` (la cuenta #0 de Anvil, la que `DeployLocal.s.sol` registra como relayer) y `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Project Settings → API — nunca el `anon`, y nunca lo commitees).

La ventana de disputa real es de 4 horas — para probar el flujo completo sin esperar:

```bash
npm run dev:fast-forward
```

Adelanta el reloj de tu Anvil local 4h+1min de una sola vez (rechaza correr contra cualquier RPC que no sea `127.0.0.1`/`localhost`, por seguridad). Con `settle:loop` corriendo, el próximo par de ciclos pasa el mercado de `PROPOSED` a `SETTLED` a `claimed`.

El 5% de la casa se anota en `houseTake` y el USDC **se queda dentro del contrato**. Hoy no hay función para retirarlo a una wallet de la casa. El jugador, si tiene ganancias (saldo por encima del depósito), usa **Retirar ganancias**.

`Cobrar`/cancelar en la billetera **no** cobra el premio del partido: solo devuelve la apuesta si todavía estás dentro de los 10 minutos y el mercado no se liquidó.

## Disposable university VPS demo

La [guía del demo universitario desechable en un VPS](docs/deployment/disposable-vps-demo.md) describe una instalación temporal con un solo puerto HTTPS. Sirve deliberadamente el middleware de Vite y el RPC administrativo de Anvil mediante proxy, por lo que **no está lista para producción**. Usa el worker de liquidación de Compose; no activa la ruta inconclusa de Supabase Edge `settlement-tick`.

### Cuando esto se suba a un VPS

`scripts/settlement/tick.mjs` (el núcleo de la lógica) es agnóstico al runtime — la misma función corre hoy en un loop de Node y, sin cambios, puede correr como Edge Function con `pg_cron` (igual que el poller). `supabase/deploy/settlement-tick-cron.sql` ya tiene la migración lista para ese día — vive fuera de `supabase/migrations/` a propósito, porque una migración comentada igual queda marcada como "aplicada" y nunca se puede reactivar.

---

## Arranque local

Hacen falta **tres procesos**: Anvil (8545), Vite (5173) y el loop de liquidación. No abras `http://127.0.0.1:8545` en el navegador: eso es el nodo, no la app.

### 1. Anvil (chain 80002)

```bash
# Foundry en PATH, o: $env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"
npm run anvil
# equivalente: anvil --chain-id 80002 --host 127.0.0.1 --port 8545 --block-time 1
```

Si no tenés Foundry instalado: `curl -L https://foundry.paradigm.xyz | bash` y después `foundryup`.

En Windows también: `scripts/dev-web3.ps1`.

### 2. Contratos

```bash
npm run deploy:local
```

Eso despliega CTF (mock), USDC mock, FPMM, MarketFactory, ResolutionAdapter y **HouseBank**. Copiá las direcciones al `.env.local`. Si Anvil ya estaba corriendo de un deploy anterior, las direcciones típicas de Foundry son:

```
VITE_CTF_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
VITE_USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
VITE_FPMM_FACTORY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
VITE_MARKET_FACTORY_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
VITE_RESOLUTION_ADAPTER_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
VITE_HOUSE_BANK_ADDRESS=<la que imprima el script; cambia si redesplegás solo HouseBank>
```

Si solo redesplegás `HouseBank` (límites, cancel, etc.):

```bash
cd contracts
forge create src/HouseBank.sol:HouseBank --broadcast --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --constructor-args <USDC> <FACTORY> <ADAPTER> <CTF>
```

Actualizá `VITE_HOUSE_BANK_ADDRESS` y reiniciá Vite. El saldo de la casa **se resetea**.

### 3. Frontend

```bash
cp .env.example .env.local   # o copiá a mano; nunca subas .env.local
```

Mínimo en `.env.local`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_FEATURE_WEB3=true
VITE_AMOY_RPC_URL=http://127.0.0.1:8545
VITE_HOUSE_BANK_ADDRESS=0x...
# + el resto de direcciones de arriba
```

```bash
npm install
npm run dev
```

App: **http://127.0.0.1:5173**

### 4. Liquidación (settle:loop)

Agregá al mismo `.env.local` (sin prefijo `VITE_`, para que Vite nunca los meta en el bundle del navegador):

```env
RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SUPABASE_SERVICE_ROLE_KEY=...
```

```bash
npm run settle:loop
```

Ver "Liquidación: cómo se cobra" arriba.

### 5. MetaMask

- Red: chain id **80002**, RPC **http://127.0.0.1:8545** (no Alchemy / Amoy público).
- Si la tx sale "fallida" pero el saldo sube, casi siempre el RPC de MetaMask no es Anvil.
- Recarga y apuesta son **transacciones** (Activity → Confirmada), no un mensaje suelto.

Vite sirve helpers en `/__anvil/*` (gas, create-market, mine). El plugin tiene que quedar **síncrono** o se rompe el WebSocket de HMR (`Connection header did not include 'upgrade'`).

---

## Stack

| Capa | Tech |
|---|---|
| App | React 19, Vite 8, Tailwind 4, React Router |
| Wallet | Wagmi 3, Viem, MetaMask (injected) |
| Auth / datos | Supabase (Google OAuth, RLS, `pg_cron`) |
| Ingesta | `startgg-poller` (Edge Function, cron cada minuto), `startgg-import` (agregar por link) |
| Liquidación | `scripts/settlement-loop.mjs` (local, dev) → `settlement-tick` Edge Function + cron (VPS, pendiente de activar) |
| Contratos | Foundry, Solidity 0.8.24, OpenZeppelin |
| Casa | `contracts/src/HouseBank.sol` |
| i18n | `src/i18n/` (`es-419` / `en`) |

---

## Scripts

```bash
npm run dev              # Vite en 127.0.0.1:5173
npm run anvil            # Anvil 80002
npm run deploy:local     # forge script DeployLocal
npm run settle:loop      # loop de liquidación local (postResult → settle → claim)
npm run dev:fast-forward # salta el CHALLENGE_WINDOW de 4h en Anvil (solo localhost)
npm run lint
npm run test             # Vitest
npm run test:e2e         # Playwright
npm run test:db          # pgTAP / Supabase
npm run build
```

Contratos:

```bash
cd contracts
forge test --match-contract HouseBankTest
forge test --fuzz-runs 256
```

Edge Functions (Deno, fuera del workspace de Vitest):

```bash
cd supabase/functions
deno test
```

---

## Arquitectura (resumen)

```
React (Vite) ──┬── Supabase Auth + Postgres (torneos, sets, RLS)
               │      └── pg_cron: startgg-poller (cada minuto)
               └── Anvil 80002
                      ├── MarketFactory / ResolutionAdapter / CTF
                      └── HouseBank  (saldo, apuestas, claim, houseTake)

scripts/settlement-loop.mjs (local) ──► Anvil directo (viem)
  reimplementa postResult/settle/claim sin pasar por Supabase —
  el relayer en la nube no puede alcanzar un Anvil local.
```

- El USDC de apuesta es **interno** al `HouseBank` (mint local en Anvil).
- Abrir una línea (`createMarket` desde la casa) **no come** el saldo de apuestas: bono + liquidez se mintean aparte (~101 USDC de seed on-chain, no del bankroll del jugador).
- Identidad de apuesta: Google `user.id` → `accountId` → `pid = keccak256(wallet, accountId)`.
- Identidad de mercado: `questionId = keccak256(startgg_event_id, marketType, keccak256(outcomeRef))` — se recalcula igual en el frontend (al crear el mercado) y en `settlement-loop.mjs` (al liquidar), nunca se guarda como fuente de verdad porque el índice on-chain (`onchain_markets`, poblado por `event-indexer`) no llega a un Anvil local.

---

## Google OAuth

1. Google Cloud: cliente OAuth web, redirect `https://<project>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Google.
3. Site URL y Redirect: `http://127.0.0.1:5173/` (mejor que `localhost` si Vite está en 127.0.0.1).

---

## Qué no hacer

- No commitear `.env.local` ni claves.
- No abrir el puerto 8545 como si fuera la web.
- No apuntar MetaMask a Amoy público si estás en Anvil.
- No esperar que el premio se acredite solo al terminar el set **sin** `settle:loop` corriendo — hoy es un proceso local, no automático en la nube.

---

## Licencia

MIT.
