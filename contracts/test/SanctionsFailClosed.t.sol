// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Threat-matrix RED (now GREEN against MarketFactory/ResolutionAdapter's
// `notSanctioned` modifier): a zero-address (unset) sanctions oracle MUST
// revert every gated call — fail CLOSED, never fail-open into permitting
// trades/creation/redemption. See design.md Decision 6 and tasks.md 2.1 /
// 4.5.

import {Fixtures} from "./Fixtures.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {ISanctionsList} from "../src/interfaces/ISanctionsList.sol";

contract SanctionsFailClosedTest is Fixtures {
    function test_createMarket_revertsWhenOracleUnset() public {
        vm.prank(address(this));
        factory.setSanctionsOracle(ISanctionsList(address(0)));

        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("outcome-A"));

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.Sanctioned.selector, creator));
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);
    }

    function test_buy_revertsWhenOracleUnset() public {
        (bytes32 questionId,) = _createActiveMarket(bytes32("outcome-A"));

        factory.setSanctionsOracle(ISanctionsList(address(0)));

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.Sanctioned.selector, trader));
        factory.buy(questionId, 10e6, 0, 0);
    }

    function test_sell_revertsWhenOracleUnset() public {
        (bytes32 questionId,) = _createActiveMarket(bytes32("outcome-A"));

        vm.prank(trader);
        factory.buy(questionId, 10e6, 0, 0);

        factory.setSanctionsOracle(ISanctionsList(address(0)));

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.Sanctioned.selector, trader));
        factory.sell(questionId, 1e6, 0, type(uint256).max);
    }

    function test_disputeResult_revertsWhenOracleUnset() public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("outcome-A"));
        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("result-ref"));

        adapter.setSanctionsOracle(ISanctionsList(address(0)));

        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("Sanctioned(address)")), challenger));
        adapter.disputeResult(questionId);
    }

    function test_redeem_revertsWhenOracleUnset() public {
        (bytes32 questionId,) = _createActiveMarket(bytes32("outcome-A"));

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("result-ref"));
        vm.warp(block.timestamp + adapter.CHALLENGE_WINDOW() + 1);
        adapter.settle(questionId);

        adapter.setSanctionsOracle(ISanctionsList(address(0)));

        uint256[] memory indexSets = new uint256[](1);
        indexSets[0] = 1;

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("Sanctioned(address)")), trader));
        adapter.redeem(questionId, indexSets);
    }

    function test_flaggedAddress_rejectedEvenWithOracleSet() public {
        sanctions.setSanctioned(trader, true);

        (bytes32 questionId,) = _createActiveMarket(bytes32("outcome-A"));

        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.Sanctioned.selector, trader));
        factory.buy(questionId, 10e6, 0, 0);
    }
}
