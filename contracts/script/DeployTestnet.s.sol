// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {ResolutionAdapter} from "../src/ResolutionAdapter.sol";
import {MockConditionalTokens} from "../test/mocks/MockConditionalTokens.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockFPMMFactory} from "../test/mocks/MockFPMMFactory.sol";
import {MockSanctionsList} from "../test/mocks/MockSanctionsList.sol";

contract DeployTestnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        
        address deployerAddr = vm.addr(deployerKey);

        // Deploy dependencies
        MockConditionalTokens ctf = new MockConditionalTokens();
        MockERC20 usdc = new MockERC20();
        MockFPMMFactory fpmmFactory = new MockFPMMFactory();
        MockSanctionsList oracle = new MockSanctionsList();

        // Deploy core
        MarketFactory factory = new MarketFactory(
            ctf, usdc, fpmmFactory, oracle, deployerAddr, deployerAddr
        );

        ResolutionAdapter adapter = new ResolutionAdapter(
            ctf, usdc, oracle, deployerAddr, deployerAddr
        );

        factory.setResolutionAdapter(address(adapter));
        
        // Mint initial USDC to the user's wallet so they can test
        // 0x2BeA3c5B2F7a64b649c9faD5db2609dC7dFdFb4a
        usdc.mint(0x2BeA3c5B2F7a64b649c9faD5db2609dC7dFdFb4a, 1000000 * 10**6);

        vm.stopBroadcast();

        console.log("CTF_ADDRESS=%s", address(ctf));
        console.log("USDC_ADDRESS=%s", address(usdc));
        console.log("FPMM_FACTORY_ADDRESS=%s", address(fpmmFactory));
        console.log("MARKET_FACTORY_ADDRESS=%s", address(factory));
        console.log("RESOLUTION_ADAPTER_ADDRESS=%s", address(adapter));
    }
}
