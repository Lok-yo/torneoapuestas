// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Fuzz-tests creation/challenge/dispute bond accounting: total collateral
// pulled/paid out across creation, challenge, and result-dispute flows
// must conserve exactly (no dust minted/burned) and slash splits must
// match design.md Flow 2 / Parameters exactly. See tasks.md 5.2.

import {Fixtures} from "./Fixtures.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract BondAccountingTest is Fixtures {
    function testFuzz_creationBond_refundedInFullWhenUnchallenged(uint256 seed) public {
        uint256 seedLiquidity = bound(seed, factory.MIN_LIQUIDITY(), 5_000e6);
        usdc.mint(creator, seedLiquidity);

        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32(seed));
        uint256 creatorBalanceBefore = usdc.balanceOf(creator);

        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, seedLiquidity, block.timestamp + 2 hours);

        assertEq(
            usdc.balanceOf(creator),
            creatorBalanceBefore - factory.CREATION_BOND() - seedLiquidity,
            "bond + seed pulled from creator at creation"
        );

        vm.warp(block.timestamp + factory.MAX_CREATION_WINDOW() + 1);
        factory.activateIfUnchallenged(questionId);

        assertEq(
            usdc.balanceOf(creator),
            creatorBalanceBefore - seedLiquidity,
            "creation bond refunded in full, seed stays locked as liquidity"
        );
    }

    function testFuzz_challengeUpheld_slashSplitIsExactlyHalf(bool upheld) public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("fuzzy-outcome"));
        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        vm.prank(challenger);
        factory.challengeCreation(questionId);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 challengerBefore = usdc.balanceOf(challenger);
        uint256 creatorBefore = usdc.balanceOf(creator);

        vm.prank(multisig);
        factory.ruleCreation(questionId, upheld);

        if (upheld) {
            uint256 half = factory.CREATION_BOND() / 2;
            assertEq(
                usdc.balanceOf(treasury),
                treasuryBefore + (factory.CREATION_BOND() - half),
                "treasury gets the non-challenger half"
            );
            assertEq(
                usdc.balanceOf(challenger),
                challengerBefore + half + factory.CHALLENGER_BOND(),
                "challenger gets half the slashed bond plus their own bond back"
            );
        } else {
            assertEq(
                usdc.balanceOf(creator),
                creatorBefore + factory.CREATION_BOND() + factory.CHALLENGER_BOND(),
                "creator gets both bonds back when the challenge is rejected"
            );
        }
    }

    function testFuzz_disputeBond_conservedAcrossUpheldAndOverturned(bool upheld) public {
        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("dispute-outcome"));
        vm.prank(creator);
        factory.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("result-ref"));

        vm.prank(challenger);
        adapter.disputeResult(questionId);

        uint256 challengerBefore = usdc.balanceOf(challenger);
        uint256 adapterBefore = usdc.balanceOf(address(adapter));

        vm.prank(multisig);
        adapter.rule(questionId, upheld ? 0 : 1, upheld);

        if (upheld) {
            // Disputer's bond stays escrowed in the adapter (forfeited).
            assertEq(usdc.balanceOf(challenger), challengerBefore, "disputer receives nothing when upheld");
            assertEq(usdc.balanceOf(address(adapter)), adapterBefore, "bond remains escrowed in the adapter");
        } else {
            assertEq(
                usdc.balanceOf(challenger),
                challengerBefore + adapter.DISPUTE_BOND() + adapter.DISPUTE_REWARD(),
                "disputer refunded bond + reward on overturn"
            );
        }
    }
}
