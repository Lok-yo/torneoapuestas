// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Amoy testnet deploy script. Wires MarketFactory + ResolutionAdapter over
// env-provided addresses for the deployed CTF singleton, USDC collateral,
// an FPMM factory (canonical if one exists on Amoy, otherwise a
// from-source deploy — design.md Open Questions), and a sanctions oracle
// (owner-settable mock on Amoy per design.md Decision 6). Multisig
// composition/signer set is maintainer-owned and passed in via env, never
// hardcoded here (design.md Open Questions, proposal.md deferred item).
// See tasks.md 5.5.

import {Script, console} from "forge-std/Script.sol";
import {IConditionalTokens} from "../src/interfaces/IConditionalTokens.sol";
import {ISanctionsList} from "../src/interfaces/ISanctionsList.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MarketFactory, IFPMMFactory} from "../src/MarketFactory.sol";
import {ResolutionAdapter} from "../src/ResolutionAdapter.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address ctfAddress = vm.envAddress("CTF_ADDRESS");
        address collateralAddress = vm.envAddress("USDC_ADDRESS");
        address fpmmFactoryAddress = vm.envAddress("FPMM_FACTORY_ADDRESS");
        address sanctionsOracleAddress = vm.envOr("SANCTIONS_ORACLE_ADDRESS", address(0));
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(deployerKey);

        MarketFactory factory = new MarketFactory(
            IConditionalTokens(ctfAddress),
            IERC20(collateralAddress),
            IFPMMFactory(fpmmFactoryAddress),
            ISanctionsList(sanctionsOracleAddress),
            multisig,
            treasury
        );

        ResolutionAdapter adapter = new ResolutionAdapter(
            IConditionalTokens(ctfAddress),
            IERC20(collateralAddress),
            ISanctionsList(sanctionsOracleAddress),
            multisig,
            relayer
        );

        factory.setResolutionAdapter(address(adapter));

        vm.stopBroadcast();

        console.log("MarketFactory deployed at:", address(factory));
        console.log("ResolutionAdapter deployed at:", address(adapter));
        if (sanctionsOracleAddress == address(0)) {
            console.log(
                "WARNING: SANCTIONS_ORACLE_ADDRESS unset - every gated call will revert (fail-closed by design)."
            );
            console.log(
                "Deploy a MockSanctionsList (Amoy only) or the real Chainalysis oracle (mainnet) and call setSanctionsOracle()."
            );
        }
    }
}
