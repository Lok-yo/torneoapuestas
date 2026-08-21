# Plan de Implementación: Correcciones Mayores de UX y Lógica

## Contexto

El usuario reportó 6 áreas problemáticas. La investigación del código reveló bugs críticos de datos (Losers bracket descartado por constraint de BD), lógica de fases incorrecta, textos engañosos, y flujos de creación de mercados inconsistentes.

---

## 1. Poller y Estado de Torneos en Tiempo Real

### Problema

- Los torneos importados desde start.gg **nunca llegan a estado "FINALIZADO"** porque el poller siempre los guarda como `IN_PROGRESS` y nunca actualiza a `COMPLETED`.
- La función `derivePhase()` muestra "Fase de Grupos" cuando el torneo ya está en Top 8 (porque ningún set tiene `state === 'COMPLETED'` todavía — todos están `PENDING`).
- La página de detalle del torneo carga los sets **una sola vez** al montar y no se actualiza automáticamente.

### Causa Raíz

1. [`supabase/functions/startgg-poller/index.ts`](file:///home/kiyo/Proyectos/Aurelio/GG2/supabase/functions/startgg-poller/index.ts) hace `upsert` con `status: 'IN_PROGRESS'` incondicional — nunca detecta si el torneo terminó.
2. [`src/lib/tournamentPhase.js`](file:///home/kiyo/Proyectos/Aurelio/GG2/src/lib/tournamentPhase.js) tiene una escalera de condiciones que no contempla el caso "hay sets Top 8 pero todos están PENDING" (lo trata como Fase de Grupos).
3. [`src/pages/TournamentDetailPage.jsx`](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/TournamentDetailPage.jsx) no tiene `setInterval` ni suscripción Realtime para refrescar sets.

### Cambios Propuestos

#### [MODIFY] [index.ts](file:///home/kiyo/Proyectos/Aurelio/GG2/supabase/functions/startgg-poller/index.ts)
- Después de ingestar los sets de un torneo, verificar si **todos los sets** tienen `state === 'COMPLETED'`. Si es así, hacer `UPDATE tournaments SET status = 'COMPLETED' WHERE id = tournamentId`.
- Esto hace que `derivePhase` devuelva correctamente "04 FINALIZADO".

#### [MODIFY] [tournamentPhase.js](file:///home/kiyo/Proyectos/Aurelio/GG2/src/lib/tournamentPhase.js)
Reescribir `derivePhase()`:
```js
export function derivePhase(status, sets = []) {
  if (status === 'CANCELLED') return null
  if (status === 'COMPLETED') return { step: 4, label: PHASE_LABEL[4] }

  // Si hay sets Top 8 (cualquier estado), estamos en Top 8
  if (sets.length > 0) {
    const allCompleted = sets.every(s => s.state === 'COMPLETED')
    if (allCompleted) return { step: 4, label: PHASE_LABEL[4] }
    return { step: 3, label: PHASE_LABEL[3] }
  }

  if (status === 'IN_PROGRESS' || status === 'REGISTRATION_CLOSED')
    return { step: 2, label: PHASE_LABEL[2] }

  return { step: 1, label: PHASE_LABEL[1] }
}
```

#### [MODIFY] [TournamentDetailPage.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/TournamentDetailPage.jsx)
- Agregar un `setInterval` de **30 segundos** que re-fetch los sets y el estado del torneo mientras la página esté montada y el torneo no esté `COMPLETED`.
- Limpiar el intervalo en el `useEffect` cleanup y cuando el torneo llegue a `COMPLETED`.

---

## 2. Botón "Cobrar" → Renombrar a "Cancelar Apuesta"

### Problema

El botón dice "Cobrar" pero en realidad **cancela** la apuesta y devuelve el USDC. El usuario interpreta "Cobrar" como reclamar ganancias, no como cancelar.

### Causa Raíz

Las traducciones en [`src/i18n/es.js`](file:///home/kiyo/Proyectos/Aurelio/GG2/src/i18n/es.js) usan "Cobrar" para la acción `cancelBet`.

### Cambios Propuestos

#### [MODIFY] [es.js](file:///home/kiyo/Proyectos/Aurelio/GG2/src/i18n/es.js)
```diff
- cashOut: 'Cobrar',
+ cashOut: 'Cancelar apuesta',
- cashOutHint: 'Tienes 10 minutos para retirar la apuesta...',
+ cashOutHint: 'Tienes 10 minutos para cancelar la apuesta y recuperar tu USDC...',
- cashOutLeft: 'Te quedan {time} para cobrar esta apuesta.',
+ cashOutLeft: 'Te quedan {time} para cancelar esta apuesta.',
- cashOutLocked: 'Ya pasaron 10 minutos. Esta apuesta se queda en el partido.',
+ cashOutLocked: 'Ya pasaron 10 min. Esta apuesta está bloqueada hasta que termine el partido.',
- cashOutDone: 'Retiraste la apuesta. El USDC volvió a tu saldo de la casa.',
+ cashOutDone: 'Apuesta cancelada. El USDC volvió a tu saldo.',
- cashOutReturned: 'Retirada — el USDC volvió al saldo de la casa.',
+ cashOutReturned: 'Cancelada — USDC devuelto a tu saldo.',
- cashOutFail: 'No se pudo retirar la apuesta.',
+ cashOutFail: 'No se pudo cancelar la apuesta.',
```

#### [MODIFY] [en.js](file:///home/kiyo/Proyectos/Aurelio/GG2/src/i18n/en.js)
Mismos cambios equivalentes ("Cash out" → "Cancel bet").

---

## 3. Mercados Duplicados en la Página de Crear Mercado

### Problema

Desde la vista del torneo, al crear un mercado se marca como "Mercado Activo" ✅. Pero si el usuario va a `/mercados/nuevo` y selecciona el mismo torneo, los sets con mercado activo **siguen apareciendo** disponibles para crear. Al intentar crear uno, da error "Esa línea ya existe on-chain."

### Causa Raíz

- En [`CreateMarketPage.jsx`](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/CreateMarketPage.jsx), los `availableSets` ya filtran `!s.has_market`. Pero `has_market` depende del cache de Supabase (`onchain_markets`). Si el mercado se creó localmente en Anvil, el cache de Supabase no se actualiza (no hay indexador corriendo).
- El error UX es que el usuario puede ver el set y hacer click, recibiendo un error críptico en vez de feedback visual claro.

### Cambios Propuestos

#### [MODIFY] [CreateMarketPage.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/CreateMarketPage.jsx)
1. Los sets que ya tienen mercado (`has_market === true`) deben mostrarse con un badge "Mercado activo" y tener el botón de selección **deshabilitado**, en vez de desaparecer silenciosamente.
2. Añadir una verificación on-chain adicional: antes de mostrar los sets, leer `markets(questionId).state` del contrato para cada set y marcar como activos los que tengan `state !== 0` (NONE). Esto cubre el caso de Anvil local sin indexador.

#### [MODIFY] [CreateMarketModal.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/components/CreateMarketModal.jsx)
- Arreglar inconsistencia: `MIN_LIQUIDITY_USDC = 100n * 1_000_000n` pero el input dice `min="1"`. Cambiar a `min="100"` para que coincida con la validación del `handleSubmit`.

---

## 4. Selección de Jugador (Mercado "Ganador del Torneo")

### Problema

Al seleccionar un jugador de los 8, el mercado se crea como un **binario Sí/No** ("¿Ganará [Jugador] el torneo?"). El usuario esperaría un mercado de 8 opciones donde apuestas por quién gana.

### Análisis Técnico

Un mercado de 8 opciones requiere cambios profundos en los contratos inteligentes (`HouseBank.sol` y `MarketFactory.sol`) que hoy están diseñados para mercados binarios (2 outcomes). Esto implicaría:
- Rediseñar la estructura de datos del pool (actualmente `sideStake[2]`)
- Nuevas fórmulas de odds para N outcomes
- Nuevo sistema de liquidación (payout a N-1 perdedores)
- Nuevas pruebas de fuzzing

> [!IMPORTANT]
> **Recomendación**: Mantener el modelo binario actual pero **mejorar la UX** para que sea claro. En vez de mostrar una grilla de 8 jugadores que confunde, ofrecer una lista donde cada jugador muestra "¿Ganará [Nombre] el torneo? → Crear mercado Sí/No". Así el usuario entiende que crea un mercado binario por jugador.
>
> El mercado de 8 opciones (pool compartido donde apuestas a 1 de 8) es una feature futura que requiere un nuevo contrato.

### Cambios Propuestos

#### [MODIFY] [CreateMarketPage.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/CreateMarketPage.jsx)
- Cambiar la UI del tipo "Ganador del torneo": en vez de una grilla genérica de botones con nombres, mostrar una lista tipo card donde cada jugador tiene:
  - Nombre del jugador
  - Texto: "¿Ganará el torneo?"
  - Badge si ya existe un mercado para ese jugador
  - Botón "Crear mercado Sí/No"
- Agregar texto explicativo: *"Cada jugador genera un mercado independiente de Sí/No. Puedes crear uno por jugador."*

---

## 5. Brackets Incompletos y Textos Incorrectos

### Problema A: Bracket incompleto (Losers bracket no aparece)

El bracket del torneo LokoTastico (y cualquier torneo de doble eliminación) aparece incompleto porque **los sets del Losers bracket se descartan silenciosamente**.

### Causa Raíz

La tabla `tournament_sets` tiene un constraint:
```sql
round integer not null check (round > 0)
```

En start.gg, los sets del **Losers bracket tienen rounds negativos** (`-1`, `-2`, `-3`...). PostgreSQL rechaza el INSERT y el poller lo ignora silenciosamente.

### Cambios Propuestos

#### [NEW] Nueva migración SQL
```sql
-- Permitir rounds negativos para Losers bracket de start.gg
ALTER TABLE public.tournament_sets DROP CONSTRAINT tournament_sets_round_check;
ALTER TABLE public.tournament_sets ADD CONSTRAINT tournament_sets_round_check CHECK (round != 0);
```

#### [MODIFY] [BracketSection.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/components/BracketSection.jsx)
Reescribir completamente el componente para soportar doble eliminación:

1. **Separar Winners y Losers**: Dividir los sets en `winners` (round > 0) y `losers` (round < 0).
2. **Corregir `ROUND_LABEL`**: El mapeo actual está completamente invertido. Round 1 en start.gg es la primera ronda, NO Grand Finals. Usar labels dinámicos basados en la cantidad de rounds:
   ```js
   // Winners: round más alto = Winners Finals, el anterior = Winners Semis, etc.
   // Losers: round más negativo = primera ronda losers, -1 = Losers Finals
   // Grand Finals: el round más alto de Winners + 1 (o marcado especial)
   ```
3. **Layout**: Renderizar Winners arriba, Losers abajo, con Grand Finals al centro/derecha.

---

### Problema B: Texto "Predicciones" en el tab

El tab dice "Predicciones" pero muestra los mercados de apuestas activos. Debería decir "Mercados" o "Apuestas".

#### [MODIFY] [TournamentDetailPage.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/TournamentDetailPage.jsx)
```diff
- { id: 'predicciones', label: 'Predicciones' },
+ { id: 'predicciones', label: 'Mercados' },
```

---

### Problema C: "Cartelera" como nombre de sección

#### [MODIFY] [TournamentsPage.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/TournamentsPage.jsx) y [HomePage.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/pages/HomePage.jsx)
```diff
- Cartelera
+ Torneos en vivo
```

---

### Problema D: MockA/MockB en mercados de torneos sin Top 8

La investigación confirma que no existe "MockA/MockB" hardcodeado. Lo que pasa es que cuando un torneo **no tiene sets con nombres de jugadores** (porque aún no se ingresaron los entrants), los nombres caen al fallback `'Por definir'`. Pero el sistema permite crear mercados con esos datos vacíos.

#### [MODIFY] [CreateMarketModal.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/components/CreateMarketModal.jsx) y [MatchCard.jsx](file:///home/kiyo/Proyectos/Aurelio/GG2/src/components/MatchCard.jsx)
- Deshabilitar el botón "Apostar" / "Crear mercado" cuando `entrant_a_name` o `entrant_b_name` son `null` o `'Por definir'`.
- Mostrar tooltip: *"Esperando jugadores..."*

---

## 6. Momios (Odds) y la Casa Nunca Pierde

### Estado Actual

El `HouseBank.sol` ya implementa un sistema parimutuel con las siguientes protecciones:

| Parámetro | Valor | Efecto |
|---|---|---|
| `HOUSE_BPS` | 500 (5%) | La casa toma 5% del pool total antes de repartir |
| `MIN_WIN_BPS` | 100 (1%) | Margen mínimo de ganancia |
| `OPENING_MAX` | 100 USDC | Cap en la primera apuesta |
| `MIN_BET` | 1 USDC | Apuesta mínima |
| `CANCEL_WINDOW` | 10 min | Ventana para cancelar |

**Fórmula de odds**:
- Pool total: $P = S_0 + S_1$
- Pool neto (después del 5%): $Net = P \times 0.95$
- Odds del lado $i$: $Odds_i = \frac{Net}{S_i}$
- Payout estimado: $Payout = \frac{stake \times Net}{S_i + stake}$

**Protección ante mercado vacío**: Si un lado tiene 0 stake, el mercado se **anula** (`VOIDED`) y se devuelve el 100% a todos.

> [!NOTE]
> El sistema ya está diseñado para que la casa nunca pierda. El 5% se toma del pool antes de pagar a los ganadores. Si no hay apuestas en un lado, se anula en vez de regalarse.

### Problema detectado en UI

Los odds en el frontend se muestran como número decimal (ej: `2.00`), pero no hay contexto para el usuario. Un jugador casual no entiende qué significa "2.00".

### Cambios Propuestos

#### [MODIFY] Componente de odds en el frontend
- Mostrar los odds en formato más amigable: **"x2.00"** (multiplicador) junto con el payout estimado en USDC.
- Agregar tooltip: *"Si apuestas 10 USDC y ganas, recibes ~19 USDC (después del 5% de comisión de la casa)"*.

---

## Verificación

### Tests Automatizados
```bash
npm run test          # Vitest unitarios (derivePhase, i18n, etc.)
cd contracts && forge test --fuzz-runs 256  # Contratos (sin cambios, verificar que siguen pasando)
```

### Manual
- Verificar que un torneo completado aparece como "Finalizado" en la página.
- Verificar que el bracket muestra Winners Y Losers correctamente.
- Verificar que el botón dice "Cancelar apuesta" y funciona igual.
- Verificar que no se pueden crear mercados duplicados ni de sets sin jugadores.
- Crear un mercado y apostar: verificar que los odds muestran el multiplicador y el payout estimado.

---

## Orden de Ejecución Sugerido

| Prioridad | Tarea | Complejidad | Impacto |
|---|---|---|---|
| 🔴 P0 | Migración BD: permitir rounds negativos | Baja | Desbloquea brackets completos |
| 🔴 P0 | Reescribir `BracketSection.jsx` (Winners/Losers) | Media-Alta | Fix visual crítico |
| 🔴 P0 | Fix `derivePhase()` + poller marca `COMPLETED` | Baja | Torneos finalizados se ven bien |
| 🟡 P1 | Auto-refresh sets cada 30s en TournamentDetailPage | Baja | Experiencia en vivo |
| 🟡 P1 | Renombrar "Cobrar" → "Cancelar apuesta" (i18n) | Trivial | UX clarity |
| 🟡 P1 | Renombrar tab "Predicciones" → "Mercados" | Trivial | UX clarity |
| 🟡 P1 | Renombrar "Cartelera" → "Torneos en vivo" | Trivial | UX clarity |
| 🟡 P1 | Bloquear creación de mercados con jugadores vacíos | Baja | Previene MockA/MockB |
| 🟡 P1 | Mercados duplicados: mostrar badge en vez de ocultar | Media | Previene error críptico |
| 🟢 P2 | Mejorar UX "Ganador del torneo" (lista Sí/No) | Media | Claridad de producto |
| 🟢 P2 | Mejorar display de odds (multiplicador + tooltip) | Baja | UX para casuals |
| 🟢 P2 | Fix inconsistencia min liquidity en modal (1 vs 100) | Trivial | Previene error de validación |

> [!WARNING]
> La migración de BD (permitir rounds negativos) debe ejecutarse en Supabase antes de que el poller pueda ingestar brackets completos. Sin esto, el fix visual del bracket no tendrá datos.
