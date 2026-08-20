// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {ResolutionAdapter} from "../src/ResolutionAdapter.sol";
import {MockConditionalTokens} from "../test/mocks/MockConditionalTokens.sol";
import {MockFPMMFactory} from "../test/mocks/MockFPMMFactory.sol";
import {MockSanctionsList} from "../test/mocks/MockSanctionsList.sol";

/// @notice Polygon Amoy deploy using the official testnet USDC as collateral.
contract DeployAmoy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        IERC20 usdc = IERC20(vm.envAddress("USDC_ADDRESS"));
        address deployerAddr = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MockConditionalTokens ctf = new MockConditionalTokens();
        MockFPMMFactory fpmmFactory = new MockFPMMFactory();
        MockSanctionsList oracle = new MockSanctionsList();

        MarketFactory factory = new MarketFactory(
            ctf,
            usdc,
            fpmmFactory,
            oracle,
            deployerAddr,
            deployerAddr
        );

        ResolutionAdapter adapter = new ResolutionAdapter(
            ctf,
            usdc,
            oracle,
            deployerAddr,
            deployerAddr
        );

        factory.setResolutionAdapter(address(adapter));

        vm.stopBroadcast();

        console.log("CTF_ADDRESS=%s", address(ctf));
        console.log("USDC_ADDRESS=%s", address(usdc));
        console.log("FPMM_FACTORY_ADDRESS=%s", address(fpmmFactory));
        console.log("MARKET_FACTORY_ADDRESS=%s", address(factory));
        console.log("RESOLUTION_ADAPTER_ADDRESS=%s", address(adapter));
        console.log("DEPLOYER=%s", deployerAddr);
    }
}
