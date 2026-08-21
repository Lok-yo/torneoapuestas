import { describe, expect, it } from 'vitest'
import {
  parseDeployAddresses,
  renderPublicManifest,
  renderSettlementManifest,
} from '../demo-bootstrap.mjs'

const forgeOutput = `
CTF_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
FPMM_FACTORY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
MARKET_FACTORY_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
RESOLUTION_ADAPTER_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
HOUSE_BANK_ADDRESS=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
`

describe('demo bootstrap manifests', () => {
  it('extracts every DeployLocal address', () => {
    expect(parseDeployAddresses(forgeOutput)).toMatchObject({
      VITE_MARKET_FACTORY_ADDRESS: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
      VITE_HOUSE_BANK_ADDRESS: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    })
  })

  it('rejects incomplete Forge output', () => {
    expect(() =>
      parseDeployAddresses('USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'),
    ).toThrow(/missing deployment addresses/i)
  })

  it('keeps the public manifest free of the relayer key', () => {
    const addresses = parseDeployAddresses(forgeOutput)
    expect(renderPublicManifest(addresses)).not.toContain('RELAYER_PRIVATE_KEY')
    expect(renderPublicManifest(addresses)).toContain(
      'VITE_HOUSE_BANK_ADDRESS=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    )
    expect(renderSettlementManifest(addresses)).toContain(
      'RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    )
  })
})
