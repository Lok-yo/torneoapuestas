const ERROR_MAP = [
  [/user rejected/i, 'Cancelaste la transacción'],
  [/insufficient funds/i, 'Fondos insuficientes'],
  [/execution reverted/i, 'El contrato rechazó la transacción — revisá los datos'],
]

export function translateError(err) {
  const raw = err?.shortMessage ?? err?.message ?? String(err)
  for (const [pattern, translated] of ERROR_MAP) {
    if (pattern.test(raw)) return translated
  }
  return raw
}
