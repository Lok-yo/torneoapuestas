// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Proves the questionId/conditionId/positionId hashing chain MarketFactory
// and ResolutionAdapter both rely on matches (Mock)CTF's own derivation
// exactly, per design.md Decision 3's uma-ctf-adapter-style ID scheme.
// See tasks.md 5.1.

import {Fixtures} from "./Fixtures.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract IdHashingTest is Fixtures {
    function test_questionId_matchesDecision3Formula() public view {
        bytes32 outcomeRef = bytes32("entrant-123");
        bytes32 expected = keccak256(abi.encode(STARTGG_EVENT_ID, uint8(1), outcomeRef));
        bytes32 actual = _questionId(STARTGG_EVENT_ID, 1, outcomeRef);
        assertEq(actual, expected);
    }

    function test_conditionId_derivedFromResolutionAdapterAsOracle() public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("outcome-A"));

        vm.prank(creator);
        bytes32 returnedConditionId =
            factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        bytes32 expected = ctf.getConditionId(address(adapter), questionId, 2);
        assertEq(returnedConditionId, expected, "conditionId must be derived with ResolutionAdapter as oracle");
        assertEq(adapter.questionIdToConditionId(questionId), expected, "adapter's own view must agree");
    }

    function test_positionId_roundTripsThroughCollectionId() public {
        (bytes32 questionId, bytes32 conditionId) = _createActiveMarket(bytes32("outcome-A"));

        vm.prank(trader);
        factory.buy(questionId, 10e6, 0, 0);

        bytes32 collectionId = ctf.getCollectionId(bytes32(0), conditionId, 1);
        uint256 positionId = ctf.getPositionId(address(usdc), collectionId);

        assertGt(
            ctf.balanceOf(trader, positionId), 0, "trader must hold the outcome-0 position minted via the same ID chain"
        );
    }

    function test_duplicateQuestionId_rejected() public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("outcome-A"));

        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(MarketFactory.MarketAlreadyExists.selector, questionId));
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);
    }
}
