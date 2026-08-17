// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Threat-matrix RED (now GREEN against MarketFactory.timeoutCreationRuling):
// if the multisig never rules a creation challenge within 7 days, both
// bonds refund in full and the market VOIDs — it must NEVER silently
// become ACTIVE/tradeable through inaction. Fail-safe, not fail-open. See
// design.md Flow 2 "Timeout guard" and tasks.md 2.2 / 3.4.

import {Fixtures} from "./Fixtures.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract MultisigTimeoutTest is Fixtures {
    function test_timeout_voidsMarket_refundsBothBonds_neverActivates() public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("outcome-A"));
        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        vm.prank(challenger);
        factory.challengeCreation(questionId);

        uint256 creatorBalanceBefore = usdc.balanceOf(creator);
        uint256 challengerBalanceBefore = usdc.balanceOf(challenger);

        // Before the 7-day timeout: ruling attempts by anyone other than
        // the multisig still revert normally; the market stays CHALLENGED
        // (frozen), never silently activating.
        vm.expectRevert(MarketFactory.TimeoutNotElapsed.selector);
        factory.timeoutCreationRuling(questionId);

        vm.warp(block.timestamp + factory.CREATION_RULING_TIMEOUT() + 1);

        factory.timeoutCreationRuling(questionId);

        (

            /* conditionId */,
            /* startggEventId */,
            /* marketType */,
            /* creator */,
            /* fpmm */,
            MarketFactory.MarketState state,
            /* windowEnds */,
            /* creationBond */,
            /* challenger */,
            /* challengeBond */,
            /* challengedAt */
        ) = factory.markets(questionId);
        assertEq(uint8(state), uint8(MarketFactory.MarketState.VOID), "timeout must VOID, never ACTIVATE");

        assertEq(
            usdc.balanceOf(creator), creatorBalanceBefore + factory.CREATION_BOND(), "creator bond must fully refund"
        );
        assertEq(
            usdc.balanceOf(challenger),
            challengerBalanceBefore + factory.CHALLENGER_BOND(),
            "challenger bond must fully refund"
        );

        // A stale ruling call after timeout-void must revert, not
        // resurrect the market into ACTIVE.
        vm.prank(multisig);
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketFactory.InvalidState.selector,
                MarketFactory.MarketState.CHALLENGED,
                MarketFactory.MarketState.VOID
            )
        );
        factory.ruleCreation(questionId, false);
    }

    function test_timeout_cannotBeCalledBeforeChallenge() public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("outcome-B"));
        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        vm.expectRevert(
            abi.encodeWithSelector(
                MarketFactory.InvalidState.selector,
                MarketFactory.MarketState.CHALLENGED,
                MarketFactory.MarketState.PENDING
            )
        );
        factory.timeoutCreationRuling(questionId);
    }
}
