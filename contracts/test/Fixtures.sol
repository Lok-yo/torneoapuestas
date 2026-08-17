// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {ResolutionAdapter} from "../src/ResolutionAdapter.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockConditionalTokens} from "./mocks/MockConditionalTokens.sol";
import {MockFPMMFactory} from "./mocks/MockFPMMFactory.sol";
import {MockSanctionsList} from "./mocks/MockSanctionsList.sol";

/// @notice Shared deploy + wiring fixture for MarketFactory/
/// ResolutionAdapter test suites. See design.md "Testing Strategy" and
/// tasks.md Phase 5.
abstract contract Fixtures is Test {
    MockERC20 internal usdc;
    MockConditionalTokens internal ctf;
    MockFPMMFactory internal fpmmFactory;
    MockSanctionsList internal sanctions;
    MarketFactory internal factory;
    ResolutionAdapter internal adapter;

    address internal multisig = makeAddr("multisig");
    address internal treasury = makeAddr("treasury");
    address internal relayer = makeAddr("relayer");
    address internal creator = makeAddr("creator");
    address internal challenger = makeAddr("challenger");
    address internal trader = makeAddr("trader");

    uint256 internal constant STARTGG_EVENT_ID = 42;

    function setUp() public virtual {
        usdc = new MockERC20();
        ctf = new MockConditionalTokens();
        fpmmFactory = new MockFPMMFactory();
        sanctions = new MockSanctionsList();

        factory = new MarketFactory(ctf, usdc, fpmmFactory, sanctions, multisig, treasury);
        adapter = new ResolutionAdapter(ctf, usdc, sanctions, multisig, relayer);
        factory.setResolutionAdapter(address(adapter));
        factory.registerStartggEvent(STARTGG_EVENT_ID);

        _fund(creator, 10_000e6);
        _fund(challenger, 10_000e6);
        _fund(trader, 10_000e6);
        _fund(relayer, 10_000e6);

        vm.prank(relayer);
        usdc.approve(address(adapter), type(uint256).max);
        vm.prank(relayer);
        adapter.fundRelayerStake(1_000e6);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(factory), type(uint256).max);
        vm.prank(who);
        usdc.approve(address(adapter), type(uint256).max);
    }

    function _questionId(uint256 startggEventId, uint8 marketType, bytes32 outcomeRef) internal pure returns (bytes32) {
        return keccak256(abi.encode(startggEventId, marketType, outcomeRef));
    }

    /// @notice Creates and activates a market (window elapsed,
    /// unchallenged) — the common precondition for buy/sell/resolution
    /// tests.
    function _createActiveMarket(bytes32 outcomeRef) internal returns (bytes32 questionId, bytes32 conditionId) {
        questionId = _questionId(STARTGG_EVENT_ID, 0, outcomeRef);
        vm.prank(creator);
        conditionId = factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        vm.warp(block.timestamp + factory.MAX_CREATION_WINDOW() + 1);
        factory.activateIfUnchallenged(questionId);
    }
}
