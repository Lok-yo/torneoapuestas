// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConditionalTokens} from "../../src/interfaces/IConditionalTokens.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFPMMFactory} from "../../src/MarketFactory.sol";
import {MockFPMM} from "./MockFPMM.sol";

contract MockFPMMFactory is IFPMMFactory {
    event FPMMCreated(address indexed fpmm, bytes32 indexed conditionId);

    function createFixedProductMarketMaker(
        address conditionalTokens,
        address collateralToken,
        bytes32[] calldata conditionIds,
        uint256 fee
    ) external returns (address) {
        MockFPMM fpmm = new MockFPMM(
            IConditionalTokens(conditionalTokens), IERC20(collateralToken), conditionIds[0], fee
        );
        emit FPMMCreated(address(fpmm), conditionIds[0]);
        return address(fpmm);
    }
}
