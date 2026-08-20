# GG2: Smash Bros. Prediction Markets & Tournament Platform

GG2 es una plataforma open-source de esports construida en torno a la escena competitiva de *Super Smash Bros. Ultimate*. Combina la importación de torneos en tiempo real desde start.gg con un sistema de calificación ELO para los jugadores y mercados de predicción peer-to-peer integrados en la blockchain.

## 🚀 Características Principales

- **Motor de Torneos**: Importación automática de torneos de esports desde la API de **start.gg** (filtrados por región/juego), ciclo de vida automatizado de las llaves, resultados oficiales y calificaciones Elo de los jugadores.
- **Mercados de Predicción P2P**: Mercados de predicción sin custodia en la red de pruebas Polygon Amoy utilizando colateral en USDC y CTF de Gnosis. Incluye creación de mercados sin permisos, publicación de resultados mediante relayers, ventanas de disputa, contabilidad de fianzas (bonds) y arbitraje multifirma.
- **Identidad y Seguridad**: Autenticación con Supabase (Google OAuth), reserva atómica de `@usuario` (sin distinguir mayúsculas/minúsculas), vinculación opcional 1:1 de billeteras SIWE y políticas estrictas de seguridad a nivel de fila (RLS).

---

## 🔐 Correcciones de Seguridad y Contabilidad (Migración 0022)

Se aplicó un endurecimiento de seguridad basado en los hallazgos de la auditoría en PDF:

1. **Validación de Propiedad en la Resolución de Mercados**: `resolve_market()` ahora valida que quien llama a la función sea un administrador, el creador del mercado O el organizador del torneo. Evita la resolución no autorizada por parte de otros organizadores.

2. **Cálculo del Precio Promedio Ponderado**: `buy_market_shares()` ahora recalcula correctamente el precio promedio ponderado cuando un usuario compra acciones adicionales de una posición existente:
   ```
   nuevo_precio_promedio = ((acciones_viejas * precio_promedio_viejo) + (acciones_nuevas * precio_compra)) / total_acciones
   ```

3. **Cobertura de Pruebas**: Se agregó la suite pgTAP `audit_fixes.sql` con 4 aserciones que validan el cumplimiento de la propiedad y el cálculo de precios.

---

## 🛠️ Entorno y Configuración

Copia `.env.example` a `.env.local` (ignorado por git) y completa tus variables de Supabase y Web3. **Nunca subas un archivo `.env` real o una clave de service-role a GitHub.**

### Variables de Entorno del Cliente (Vite, `VITE_*`)

| Variable | Requerida | Por defecto | Descripción |
|---|---|---|---|
| `VITE_SUPABASE_URL` | **Sí** | — | URL pública del proyecto de Supabase (`https://<project_ref>.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | **Sí** | — | Clave API pública (anon) para llamadas a Supabase desde el cliente. |
| `VITE_FEATURE_WEB3` | No | `false` | Establecer en `true` para habilitar los mercados de predicción on-chain, conexión de billeteras, la ruta `/mercados/nuevo` y el panel de administración. |
| `VITE_FEATURE_IDENTITY` | No | `true` | Establecer en `false` para desactivar de emergencia el adaptador de identidad de Supabase. |
| `VITE_FEATURE_TOURNAMENTS` | No | `true` | Establecer en `false` para desactivar de emergencia el adaptador de torneos/llaves. |
| `VITE_FEATURE_RATINGS` | No | `true` | Establecer en `false` para desactivar de emergencia el adaptador de calificaciones/clasificación. |
| `VITE_MARKET_FACTORY_ADDRESS` | No | Amoy (defecto) | Dirección del contrato `MarketFactory.sol` desplegado. |
| `VITE_RESOLUTION_ADAPTER_ADDRESS` | No | Amoy (defecto)| Dirección del contrato `ResolutionAdapter.sol` desplegado. |
| `VITE_USDC_ADDRESS` | No | Amoy (defecto)| Dirección del token USDC ERC-20 (Testnet). |
| `VITE_CTF_ADDRESS` | No | Amoy (defecto)| Dirección del contrato singleton `ConditionalTokens` de Gnosis. |

---

## 🔑 Configuración de Google OAuth (Supabase + Google Cloud)

Para habilitar el inicio de sesión con Google (localmente y en producción):

1. **Google Cloud Console**:
   - Ve a [Credenciales de Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   - Crea un **ID de cliente OAuth 2.0** (Aplicación web).
   - Añade la URI de redirección autorizada: `https://<tu-project-ref-de-supabase>.supabase.co/auth/v1/callback`

2. **Panel de Supabase**:
   - Ve a **Authentication -> Providers -> Google**.
   - Habilita Google y pega tu ID de Cliente y Secreto de Cliente.
   - Ve a **Authentication -> URL Configuration**:
     - Establece **Site URL**: `http://localhost:5173/`
     - Añade a **Redirect URLs**: `http://localhost:5173/` y `http://localhost:5173`

---

## ⛽ Desarrollo Local Web3 (Anvil)

Para probar los mercados de predicción localmente sin lidiar con faucets de redes de prueba o fondos reales, usamos el nodo local `anvil` de Foundry simulando Polygon Amoy.

1. **Inicia el Nodo Local:**
   ```bash
   anvil --chain-id 80002
   ```
2. **Despliega los Contratos y Acuña USDC Falso:**
   Ejecuta el script de despliegue local para compilar los contratos principales y acuñar 1.000.000 USDC falsos en tu billetera:
   ```bash
   cd contracts
   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
   ```
3. **Fondear tu Billetera de MetaMask (POL para Gas + USDC Falsos):**
   Para transferir gas (POL) y acuñar 1.000.000 USDC de prueba a cualquier dirección de MetaMask:
   ```bash
   # Asignar POL para gas (1000 POL):
   cast rpc anvil_setBalance <TU_DIRECCION_WALLET> 0x3635c9adc5dea00000 --rpc-url http://127.0.0.1:8545

   # Acuñar 1.000.000 USDC de prueba:
   cast send 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 "mint(address,uint256)" <TU_DIRECCION_WALLET> 1000000000000 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545
   ```
4. **Autoriza el Torneo en el MarketFactory (Requerido para Anvil):**
   Para poder crear mercados de un torneo con ID de start.gg (por ejemplo, `1692032`), debes registrarlo como administrador:
   ```bash
   cast send 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 "registerStartggEvent(uint256)" 1692032 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545
   ```
5. **Adelantar Tiempo para Activar Mercados (Time Travel):**
   Los mercados recién creados entran en estado `PENDING` por una ventana de 60 minutos (`MAX_CREATION_WINDOW`). Para activarlo inmediatamente en pruebas locales:
   ```bash
   cast rpc evm_increaseTime 3660 --rpc-url http://127.0.0.1:8545
   cast rpc evm_mine --rpc-url http://127.0.0.1:8545
   cast send 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 "activateIfUnchallenged(bytes32)" <QUESTION_ID> --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://127.0.0.1:8545
   ```
6. **Configura el Frontend:**
   Actualiza tu archivo `.env.local` con las direcciones desplegadas y ajusta el RPC a tu nodo local:
   ```env
   VITE_AMOY_RPC_URL=http://127.0.0.1:8545
   VITE_CTF_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
   VITE_USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
   VITE_FPMM_FACTORY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
   VITE_MARKET_FACTORY_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
   VITE_RESOLUTION_ADAPTER_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
   ```
7. **Conecta MetaMask:**
   Añade o edita la red Polygon Amoy en MetaMask para que apunte a `http://127.0.0.1:8545` (Chain ID: 80002).

*Nota: El costo mínimo para crear un mercado está configurado en **101 USDC** (1 USDC de Bono de Creación + 100 USDC de Liquidez Inicial).*

---

## 💻 Desarrollo Local (Frontend y Backend)

```bash
npm ci                 # Instalación congelada (con package-lock)
npm run dev             # Inicia el servidor de desarrollo Vite (http://localhost:5173)
npm run lint            # Ejecuta el linter oxlint
npm run test            # Ejecuta la suite de pruebas unitarias y de repositorios (Vitest)
npm run build           # Construye el bundle de producción
npm run preview         # Previsualiza la build de producción localmente (http://localhost:4173)
```

---

## 🧪 Arquitectura de Pruebas y Pipeline CI

El proyecto aplica una cadena de validación CI de 9 trabajos en `.github/workflows/ci.yml` que debe pasar al 100%:

| Capa | Comando | Alcance y Cobertura |
|---|---|---|
| **Unitarias y Repositorios** | `npm run test` | Vitest + React Testing Library + cobertura V8 (81.6%+ de líneas). |
| **Postgres / pgTAP** | `npm run test:db` (`supabase test db`) | 16 suites pgTAP (144 aserciones) cubriendo RLS por defecto, idempotencia RPC, concurrencia en la reserva de usernames, alertas de seguridad y caché de billeteras. |
| **End-to-End** | `npm run test:e2e` (`playwright test`) | 25 especificaciones Playwright cubriendo inicio de sesión OAuth, ciclo de vida de torneos, historial de calificaciones, matriz de amenazas de enrutamiento y bloqueos lógicos Web3. |
| **Solidity Fuzzing** | `forge test --fuzz-runs 256` | Fuzzing y suite de invariantes de Foundry para `MarketFactory.sol` y `ResolutionAdapter.sol`. |
| **Análisis Estático (Solidity)** | `slither` | Análisis de seguridad de Slither para reentrancia, control de acceso e integridad del estado en `contracts/`. |
| **Calidad y Auditoría** | `oxlint`, `npm audit` | Aplicación de estilo de código y escaneo de vulnerabilidades de dependencias. |

---

## 🏛️ Resumen de la Arquitectura

```
                        ┌─────────────────────────┐
                        │      React 19 SPA       │
                        │ (Vite + Router + Wagmi) │
                        └────────────┬────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│   Auth Supabase    │    │ Postgres Supabase  │    │  Polygon Amoy CTF  │
│  (Google + Perfil) │    │  (RLS + RPCs + DB) │    │(MarketFactory.sol) │
└────────────────────┘    └────────────────────┘    └────────────────────┘
                                     ▲                         ▲
                                     │                         │
                          ┌──────────┴──────────┐   ┌──────────┴──────────┐
                          │   Edge Functions    │   │  Relayer / Indexer  │
                          │   (startgg-poller)  │   │  (Deno + Viem)      │
                          └─────────────────────┘   └─────────────────────┘
```

- **Database RLS**: Cada tabla utiliza Políticas de Seguridad a Nivel de Fila (RLS) estrictas con un `REVOKE ALL` explícito y permisos basados en roles.
- **Idempotencia**: Todas las RPC que modifican estado requieren un `p_request_id` para garantizar su ejecución como máximo una vez (at-most-once) frente a reintentos.
- **Auditoría Append-only**: Las acciones sensibles y eventos de migración emiten registros inmutables en `audit_events`, `migration_events` y `security_alerts`.

---

## 📜 Licencia

Licencia MIT.
