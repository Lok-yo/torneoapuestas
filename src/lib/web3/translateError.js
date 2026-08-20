import { decodeContractError } from './sendTx.js'
import { getLang } from '../../i18n/lang.js'

function flattenError(err) {
  const parts = []
  const visit = (value, depth) => {
    if (value == null || depth > 6) return
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value))
      return
    }
    if (typeof value !== 'object') return
    for (const key of ['shortMessage', 'message', 'details', 'reason', 'errorName', 'name']) {
      if (value[key]) parts.push(String(value[key]))
    }
    if (value.data?.errorName) parts.push(String(value.data.errorName))
    if (Array.isArray(value.metaMessages)) parts.push(value.metaMessages.join(' '))
    if (typeof value.walk === 'function') {
      try {
        visit(value.walk(), depth + 1)
      } catch {
        // ignore
      }
    }
    visit(value.cause, depth + 1)
  }
  visit(err, 0)
  return parts.join(' | ')
}

const ERROR_MAP_ES = [
  [/user rejected/i, 'Cancelaste la confirmación'],
  [/did not include ['']upgrade['']|failed to (connect to )?websocket|upgrade.*websocket/i, 'Vite/MetaMask cortó el WebSocket. Recarga la página y firma con MetaMask (no WalletConnect).'],
  [/nonce too low|nonce has already been used|already known/i, 'MetaMask tiene un nonce viejo. En MetaMask: Settings → Advanced → Clear activity tab data, e inténtalo de nuevo.'],
  [/no ve los contratos|otro nodo|RPC a http:\/\/127\.0\.0\.1:8545/i, 'MetaMask está en 80002 pero no contra Anvil. Edita la red y pon RPC http://127.0.0.1:8545'],
  [/FailedInnerCall|AddressEmptyCode|out of gas/i, 'La transacción se quedó sin gas o llamó un contrato vacío. Recarga, confirma el RPC local e inténtalo de nuevo.'],
  [/insufficient funds/i, 'No hay POL/ETH para gas en esa wallet.'],
  [/UnknownStartggEvent/i, 'Ese evento de start.gg no está registrado en el MarketFactory.'],
  [/NotOwner|0x30cd7471/i, 'El helper local usó la key equivocada para registrar el evento. Recarga e inténtalo de nuevo.'],
  [/MarketAlreadyExists/i, 'Esa línea ya existe on-chain.'],
  [/InvalidState/i, 'El mercado no está en el estado correcto (¿sigue PENDING?)'],
  [/InsufficientLiquidity/i, 'La liquidez inicial tiene que ser al menos 100 USDC'],
  [/ERC20InsufficientBalance|SafeERC20FailedOperation|transfer amount exceeds balance/i, 'No hay USDC suficiente en la wallet para abrir la línea (hace falta 101 USDC ahí, no en el saldo de la casa).'],
  [/ERC20InsufficientAllowance/i, 'Falta el approve de USDC. Inténtalo de nuevo: primero approve, después crear.'],
  [/InsufficientBalance/i, 'No te alcanza el saldo de la casa para esto. Abrir una línea cuesta bono + liquidez (101 USDC si la liquidez es 100). El número de la casa es el que vale, no el de MetaMask tokens.'],
  [/ExceedsProfits/i, 'Ese monto no son ganancias. El depósito no se retira: solo sale lo que ganaste apostando.'],
  [/NotSettled/i, 'Esa apuesta todavía no está liquidada. Cobrar en la billetera solo retira la apuesta durante 10 minutos después de hacerla.'],
  [/AlreadyClaimed/i, 'Esas ganancias ya se acreditaron.'],
  [/AlreadyOnOtherSide/i, 'Ya apostaste al otro jugador de este partido. Solo puedes ir por un lado.'],
  [/MarketNotOpen/i, 'Esta línea todavía no está abierta.'],
  [/ZeroAmount/i, 'Pon un monto mayor a cero.'],
  [/BetTooLarge/i, 'Ese monto pasa el máximo de este lado. La primera apuesta llega hasta 100 USDC; el tope sube cuando el otro lado cubre.'],
  [/BetTooSmall/i, 'Ese monto es muy bajo para este lado. Tiene que alcanzar para que el otro también gane si gana.'],
  [/CancelWindowClosed/i, 'Ya pasaron 10 minutos. Esa apuesta se queda en el partido.'],
  [/NoBetToCancel/i, 'No hay una apuesta tuya para retirar en esta línea.'],
  [/settle reverted/i, 'No se puede liquidar: el partido todavía no tiene resultado. En la billetera, Cobrar solo sirve durante 10 minutos para retirar tu apuesta.'],
  [/Sanctioned/i, 'La wallet está marcada en la lista de sanciones del contrato.'],
  [/execution reverted/i, 'El contrato revirtió sin detalle. Casi siempre MetaMask no está en Anvil: edita la red 80002 y pon RPC http://127.0.0.1:8545'],
]

const ERROR_MAP_EN = [
  [/user rejected/i, 'You cancelled the confirmation'],
  [/did not include ['']upgrade['']|failed to (connect to )?websocket|upgrade.*websocket/i, 'Vite/MetaMask dropped the WebSocket. Reload and sign with MetaMask (not WalletConnect).'],
  [/nonce too low|nonce has already been used|already known/i, 'MetaMask has a stale nonce. Settings → Advanced → Clear activity tab data, then retry.'],
  [/no ve los contratos|otro nodo|RPC a http:\/\/127\.0\.0\.1:8545/i, 'MetaMask is on 80002 but not Anvil. Edit the network RPC to http://127.0.0.1:8545'],
  [/FailedInnerCall|AddressEmptyCode|out of gas/i, 'The transaction ran out of gas or hit an empty contract. Reload, check the local RPC, retry.'],
  [/insufficient funds/i, 'That wallet has no POL/ETH for gas.'],
  [/UnknownStartggEvent/i, 'That start.gg event is not registered on MarketFactory.'],
  [/NotOwner|0x30cd7471/i, 'The local helper used the wrong key to register the event. Reload and retry.'],
  [/MarketAlreadyExists/i, 'That line already exists on-chain.'],
  [/InvalidState/i, 'The market is not in the right state (still PENDING?)'],
  [/InsufficientLiquidity/i, 'Initial liquidity must be at least 100 USDC'],
  [/ERC20InsufficientBalance|SafeERC20FailedOperation|transfer amount exceeds balance/i, 'Not enough USDC in the wallet to open the line (101 USDC there, not in the house balance).'],
  [/ERC20InsufficientAllowance/i, 'USDC approve is missing. Retry: approve first, then create.'],
  [/InsufficientBalance/i, 'House balance is not enough. Opening a line costs bond + liquidity (101 USDC if liquidity is 100).'],
  [/ExceedsProfits/i, 'That amount is not profit. Deposits stay in the house; only winnings withdraw.'],
  [/NotSettled/i, 'That bet is not settled yet. Cash out in the wallet only works for 10 minutes after you place it.'],
  [/AlreadyClaimed/i, 'Those winnings were already credited.'],
  [/AlreadyOnOtherSide/i, 'You already bet on the other player. You can only pick one side.'],
  [/MarketNotOpen/i, 'This line is not open yet.'],
  [/ZeroAmount/i, 'Enter an amount greater than zero.'],
  [/BetTooLarge/i, 'That amount is over this side’s max. First bet is capped at 100 USDC; the cap grows when the other side covers.'],
  [/BetTooSmall/i, 'That amount is too small for this side. It has to be enough that the other side still profits if it wins.'],
  [/CancelWindowClosed/i, '10 minutes passed. That bet stays on the match.'],
  [/NoBetToCancel/i, 'You have no bet to take back on this line.'],
  [/settle reverted/i, 'Cannot settle: the match has no result yet. In the wallet, Cash out only takes the bet back for 10 minutes after you place it.'],
  [/Sanctioned/i, 'This wallet is on the contract sanctions list.'],
  [/execution reverted/i, 'The contract reverted with no detail. Usually MetaMask is not on Anvil: edit network 80002 and set RPC to http://127.0.0.1:8545'],
]

export function translateError(err) {
  const named = decodeContractError(err)
  const raw = [named, flattenError(err)].filter(Boolean).join(' | ') || String(err)
  const map = getLang() === 'en' ? ERROR_MAP_EN : ERROR_MAP_ES
  for (const [pattern, translated] of map) {
    if (pattern.test(raw)) return translated
  }
  return raw
}
