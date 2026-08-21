import re

with open("README.md", "r", encoding="utf-8") as f:
    content = f.read()

new_section = """## ⛽ Web3 Local Development (Anvil)

To test the prediction markets locally without dealing with testnet faucets or real funds, we use Foundry's `anvil` local node simulating Polygon Amoy.

1. **Start the Local Node:**
   ```bash
   anvil --chain-id 80002
   ```
2. **Deploy Contracts & Mint Fake USDC:**
   Run the local deployment script to deploy the core contracts and mint 1,000,000 fake USDC to your wallet:
   ```bash
   cd contracts
   forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
   ```
3. **Configure the Frontend:**
   Update your `.env.local` with the deployed addresses and set the RPC to your local node:
   ```env
   VITE_AMOY_RPC_URL=http://127.0.0.1:8545
   VITE_CTF_ADDRESS=<deployed-ctf-address>
   VITE_USDC_ADDRESS=<deployed-usdc-address>
   VITE_FPMM_FACTORY_ADDRESS=<deployed-fpmm-factory-address>
   VITE_MARKET_FACTORY_ADDRESS=<deployed-market-factory-address>
   VITE_RESOLUTION_ADAPTER_ADDRESS=<deployed-resolution-adapter-address>
   ```
4. **Connect MetaMask:**
   Add or edit the Polygon Amoy network in MetaMask to point to `http://127.0.0.1:8545`.

*Note: The minimum market creation cost is set to **2 USDC** (1 USDC Creation Bond + 1 USDC Seed Liquidity).*

"""

content = re.sub(r'## ⛽ Polygon Amoy Testnet \(Free Testing\).*?(?=## 💻 Local Development)', new_section, content, flags=re.DOTALL)

with open("README.md", "w", encoding="utf-8") as f:
    f.write(content)
