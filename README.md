# COLISEUM — README 2.0

Plataforma de torneos de fighting games (start.gg) + apuestas parimutuel on-chain. El frontend es React 19 / Vite. La casa de apuestas vive en el contrato `HouseBank` sobre un Anvil local que se hace pasar por Polygon Amoy (chain id `80002`).

Este documento reemplaza el README anterior: describe el producto **como está hoy** (casa, límites, MetaMask, i18n, liquidación).

---

## Qué es esto ahora

- Importa torneos y sets reales desde **start.gg**.
- En cada partido (set) se puede abrir una **línea**: ¿quién gana?
- El dinero no sale de MetaMask a cada apuesta. Primero **recargás el saldo de la casa**. Ese depósito **no se retira**: se apuesta. Solo se pueden sacar **ganancias**.
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
| Cancelar apuesta | **10 minutos** después de hacerla (`Cobrar` en billetera) |

No se puede abrir con 5000 USDC ni cubrir 5000 con 10. El rango **mín. / máx.** se muestra en cada lado.

---

## Ganancias y el 5% de la casa

**Las ganancias no se reparte solas cuando termina el partido.** Hace falta:

1. El relayer publica el resultado (`postResult` en `ResolutionAdapter`).
2. Pasa la ventana de disputa.
3. Alguien llama `settle`.
4. Alguien llama `HouseBank.claim(questionId)`.

Ese `claim` acredita a **todos** los ganadores en el saldo de la casa (apuesta + ganancia). Los perdedores no cobran.

El 5% se anota en `houseTake` y el USDC **se queda dentro del contrato**. Hoy **no hay función para retirarlo** a una wallet de la casa. El jugador, si tiene ganancias (saldo por encima del depósito), usa **Retirar ganancias**.

`Cobrar` en la billetera **no** cobra el premio del partido: solo devuelve la apuesta si todavía estás dentro de los 10 minutos.

---

## Arranque local

Hacen falta **dos procesos**: Anvil (8545) y Vite (5173). No abras `http://127.0.0.1:8545` en el navegador: eso es el nodo, no la app.

### 1. Anvil (chain 80002)

```bash
# Foundry en PATH, o: $env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"
npm run anvil
# equivalente: anvil --chain-id 80002 --host 127.0.0.1 --port 8545
```

En Windows también: `scripts/dev-web3.ps1`.

### 2. Contratos

```bash
npm run deploy:local
```

Eso despliega CTF, USDC mock, FPMM, MarketFactory, ResolutionAdapter y **HouseBank**. Copiá las direcciones al `.env.local`. Si Anvil ya estaba corriendo de un deploy anterior, las direcciones típicas de Foundry son:

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

### 4. MetaMask

- Red: chain id **80002**, RPC **http://127.0.0.1:8545** (no Alchemy / Amoy público).
- Si la tx sale “fallida” pero el saldo sube, casi siempre el RPC de MetaMask no es Anvil.
- Recarga y apuesta son **transacciones** (Activity → Confirmada), no un mensaje suelto.

Vite sirve helpers en `/__anvil/*` (gas, create-market, mine). El plugin tiene que quedar **síncrono** o se rompe el WebSocket de HMR (`Connection header did not include 'upgrade'`).

---

## Stack

| Capa | Tech |
|---|---|
| App | React 19, Vite 8, Tailwind 4, React Router |
| Wallet | Wagmi 3, Viem, MetaMask (injected) |
| Auth / datos | Supabase (Google OAuth, RLS, start.gg poller) |
| Contratos | Foundry, Solidity 0.8.24, OpenZeppelin |
| Casa | `contracts/src/HouseBank.sol` |
| i18n | `src/i18n/` (`es-419` / `en`) |

---

## Scripts

```bash
npm run dev            # Vite en 127.0.0.1:5173
npm run anvil          # Anvil 80002
npm run deploy:local   # forge script DeployLocal
npm run lint
npm run test           # Vitest
npm run test:e2e       # Playwright
npm run test:db        # pgTAP / Supabase
npm run build
```

Contratos:

```bash
cd contracts
forge test --match-contract HouseBankTest
forge test --fuzz-runs 256
```

---

## Arquitectura (resumen)

```
React (Vite) ──┬── Supabase Auth + Postgres (torneos, sets, RLS)
               └── Anvil 80002
                      ├── MarketFactory / ResolutionAdapter / CTF
                      └── HouseBank  (saldo, apuestas, claim, houseTake)
```

- El USDC de apuesta es **interno** al `HouseBank` (mint local en Anvil).
- Abrir una línea (`createMarket` desde la casa) **no come** el saldo de apuestas: bono + liquidez se mintean aparte (~101 USDC de seed on-chain, no del bankroll del jugador).
- Identidad de apuesta: Google `user.id` → `accountId` → `pid = keccak256(wallet, accountId)`.

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
- No esperar que el premio se acredite solo al terminar el set.

---

## Licencia

MIT.
