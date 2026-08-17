// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Fuzz-tests challenge/creation window edges: exactly-at-boundary and
// one-second-past-boundary transactions must behave deterministically
// (challenge/dispute allowed strictly before the window ends, settlement/
// activation allowed strictly at-or-after it). See tasks.md 5.3 and specs
// "Settlement blocked mid-window" / "Result finalizes unchallenged".

import {Fixtures} from "./Fixtures.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {ResolutionAdapter} from "../src/ResolutionAdapter.sol";

contract WindowBoundariesTest is Fixtures {
    function testFuzz_creationWindow_challengeRevertsAfterElapsed(uint256 offset) public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("window-outcome"));
        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        (,,,,,, uint256 windowEnds,,,,) = factory.markets(questionId);

        uint256 lateOffset = bound(offset, 0, 365 days);
        vm.warp(windowEnds + lateOffset);

        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.WindowElapsed.selector, windowEnds));
        factory.challengeCreation(questionId);
    }

    function test_creationWindow_challengeSucceedsOneSecondBeforeEnd() public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("window-outcome-2"));
        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        (,,,,,, uint256 windowEnds,,,,) = factory.markets(questionId);
        vm.warp(windowEnds - 1);

        vm.prank(challenger);
        factory.challengeCreation(questionId);

        (,,,,, MarketFactory.MarketState state,,,,,) = factory.markets(questionId);
        assertEq(uint8(state), uint8(MarketFactory.MarketState.CHALLENGED));
    }

    function test_creationWindow_boundedByTimeToEvent() public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("imminent-event"));
        uint256 eventStartsAt = block.timestamp + 10 minutes;

        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, eventStartsAt);

        (,,,,,, uint256 windowEnds,,,,) = factory.markets(questionId);
        assertEq(windowEnds, eventStartsAt, "window must shrink to time-to-event when shorter than 60 minutes");
    }

    function testFuzz_disputeWindow_settleRevertsMidWindow(uint256 offset) public {
        (bytes32 questionId,) = _createActiveMarket(bytes32("dispute-window-outcome"));

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("result-ref"));

        uint256 withinWindow = bound(offset, 0, adapter.CHALLENGE_WINDOW() - 1);
        vm.warp(block.timestamp + withinWindow);

        vm.expectRevert(abi.encodeWithSelector(ResolutionAdapter.WindowNotElapsed.selector, questionId));
        adapter.settle(questionId);
    }

    function test_disputeWindow_settleSucceedsExactlyAtBoundary() public {
        (bytes32 questionId,) = _createActiveMarket(bytes32("dispute-window-outcome-2"));

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("result-ref"));

        vm.warp(block.timestamp + adapter.CHALLENGE_WINDOW());
        adapter.settle(questionId);
    }
}
