// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Fixtures} from "./Fixtures.sol";
import {HouseBank} from "../src/HouseBank.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract HouseBankTest is Fixtures {
    HouseBank internal house;
    address internal player = makeAddr("player");
    address internal playerB = makeAddr("playerB");
    bytes32 internal acc = keccak256("google-a");
    bytes32 internal accB = keccak256("google-b");

    function setUp() public override {
        super.setUp();
        house = new HouseBank(usdc, factory, adapter, ctf);
    }

    function test_addFunds_locks_principal() public {
        vm.prank(player);
        house.addFunds(100e6, acc);

        HouseBank.Account memory a = house.accountOf(player, acc);
        assertEq(a.balance, 100e6);
        assertEq(a.deposited, 100e6);
        assertEq(a.withdrawable, 0);
        assertEq(usdc.balanceOf(address(house)), 100e6);
        assertEq(usdc.balanceOf(player), 0);
    }

    function test_two_google_accounts_do_not_share_bankroll() public {
        vm.prank(player);
        house.addFunds(80e6, acc);
        vm.prank(player);
        house.addFunds(20e6, accB);

        assertEq(house.accountOf(player, acc).balance, 80e6);
        assertEq(house.accountOf(player, accB).balance, 20e6);
    }

    function test_cannot_withdraw_deposit() public {
        vm.prank(player);
        house.addFunds(100e6, acc);

        vm.prank(player);
        vm.expectRevert(HouseBank.ExceedsProfits.selector);
        house.withdrawProfits(1, acc);
    }

    function test_createMarket_does_not_eat_bankroll() public {
        vm.prank(player);
        house.addFunds(140e6, acc);

        bytes32 questionId = _questionId(STARTGG_EVENT_ID, 0, bytes32("from-house"));
        vm.prank(player);
        house.createMarket(questionId, STARTGG_EVENT_ID, 0, 100e6, block.timestamp + 2 hours);

        assertEq(house.accountOf(player, acc).balance, 140e6);

        (,,,,, MarketFactory.MarketState state,,,,,) = factory.markets(questionId);
        assertEq(uint8(state), 1);
    }

    function test_cannot_bet_both_sides() public {
        (bytes32 questionId,) = _createActiveMarket("one-side");
        vm.prank(player);
        house.addFunds(100e6, acc);
        vm.prank(player);
        house.placeBet(questionId, 10e6, 0, acc);
        vm.prank(player);
        vm.expectRevert(HouseBank.AlreadyOnOtherSide.selector);
        house.placeBet(questionId, 10e6, 1, acc);
    }

    function test_same_wallet_other_google_account_can_take_other_side() public {
        (bytes32 questionId,) = _createActiveMarket("split-acc");
        vm.prank(player);
        house.addFunds(50e6, acc);
        vm.prank(player);
        house.addFunds(50e6, accB);
        vm.prank(player);
        house.placeBet(questionId, 10e6, 0, acc);
        vm.prank(player);
        house.placeBet(questionId, 10e6, 1, accB);
        assertEq(house.pickOf(questionId, player, acc), 1);
        assertEq(house.pickOf(questionId, player, accB), 2);
    }

    function test_one_sided_book_voids_and_refunds() public {
        (bytes32 questionId,) = _createActiveMarket("void-me");
        vm.prank(player);
        house.addFunds(100e6, acc);
        vm.prank(player);
        house.placeBet(questionId, 40e6, 0, acc);

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("home-wins"));
        vm.warp(block.timestamp + adapter.CHALLENGE_WINDOW() + 1);
        adapter.settle(questionId);
        house.claim(questionId);

        assertTrue(house.voided(questionId));
        assertEq(house.accountOf(player, acc).balance, 100e6);
        assertEq(house.accountOf(player, acc).inPlay, 0);
        assertEq(house.houseTake(), 0);
    }

    function test_two_sided_winner_gets_pool_minus_five_percent() public {
        (bytes32 questionId,) = _createActiveMarket("juice");
        vm.prank(player);
        house.addFunds(100e6, acc);
        vm.prank(playerB);
        house.addFunds(100e6, accB);

        vm.prank(player);
        house.placeBet(questionId, 70e6, 0, acc);
        vm.prank(playerB);
        house.placeBet(questionId, 30e6, 1, accB);

        HouseBank.Book memory b = house.book(questionId);
        assertTrue(b.executable);
        assertGt(b.odds1, b.odds0);

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("home-wins"));
        vm.warp(block.timestamp + adapter.CHALLENGE_WINDOW() + 1);
        adapter.settle(questionId);
        house.claim(questionId);

        assertEq(house.houseTake(), 5e6);
        assertEq(house.accountOf(player, acc).balance, 30e6 + 95e6);
        assertEq(house.accountOf(player, acc).withdrawable, 25e6);
        assertEq(house.accountOf(playerB, accB).balance, 70e6);
        assertEq(house.accountOf(playerB, accB).withdrawable, 0);
    }

    function test_cancel_within_ten_minutes_refunds() public {
        (bytes32 questionId,) = _createActiveMarket("cancel-ok");
        vm.prank(player);
        house.addFunds(100e6, acc);
        vm.prank(player);
        house.placeBet(questionId, 40e6, 0, acc);

        vm.warp(block.timestamp + 9 minutes);
        vm.prank(player);
        house.cancelBet(questionId, acc);

        assertEq(house.accountOf(player, acc).balance, 100e6);
        assertEq(house.accountOf(player, acc).inPlay, 0);
        assertEq(house.book(questionId).stake0, 0);
        assertEq(house.pickOf(questionId, player, acc), 0);
    }

    function test_cancel_after_ten_minutes_reverts() public {
        (bytes32 questionId,) = _createActiveMarket("cancel-late");
        vm.prank(player);
        house.addFunds(100e6, acc);
        vm.prank(player);
        house.placeBet(questionId, 40e6, 0, acc);

        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(player);
        vm.expectRevert(HouseBank.CancelWindowClosed.selector);
        house.cancelBet(questionId, acc);

        assertEq(house.accountOf(player, acc).inPlay, 40e6);
        assertEq(house.accountOf(player, acc).balance, 60e6);
    }

    function test_cannot_overbet_heavy_side_against_tiny_cover() public {
        (bytes32 questionId,) = _createActiveMarket("limit");
        vm.prank(player);
        house.addFunds(20e6, acc);
        vm.prank(player);
        house.placeBet(questionId, 10e6, 0, acc);

        vm.prank(playerB);
        house.addFunds(5000e6, accB);
        vm.prank(playerB);
        vm.expectRevert(HouseBank.BetTooLarge.selector);
        house.placeBet(questionId, 5000e6, 1, accB);

        uint256 maxBet = house.maxBetOf(questionId, 1);
        assertGt(maxBet, 0);
        assertLt(maxBet, 5000e6);
        vm.prank(playerB);
        house.placeBet(questionId, maxBet, 1, accB);
        assertGt(house.book(questionId).odds1, 1e6);
    }

    function test_cannot_open_with_huge_first_bet() public {
        (bytes32 questionId,) = _createActiveMarket("open-cap");
        vm.startPrank(player);
        house.addFunds(5000e6, acc);
        vm.expectRevert(HouseBank.BetTooLarge.selector);
        house.placeBet(questionId, 5000e6, 0, acc);
        house.placeBet(questionId, 100e6, 0, acc);
        vm.stopPrank();
        assertEq(house.maxBetOf(questionId, 0), 0);
    }

    function test_cover_too_small_against_opener_reverts() public {
        (bytes32 questionId,) = _createActiveMarket("min-cover");
        vm.prank(player);
        house.addFunds(100e6, acc);
        vm.prank(player);
        house.placeBet(questionId, 100e6, 0, acc);

        vm.prank(playerB);
        house.addFunds(50e6, accB);
        vm.prank(playerB);
        vm.expectRevert(HouseBank.BetTooSmall.selector);
        house.placeBet(questionId, 1e6, 1, accB);

        uint256 minBet = house.minBetOf(questionId, 1);
        assertGe(minBet, 1e6);
        vm.prank(playerB);
        house.placeBet(questionId, minBet, 1, accB);
        assertGt(house.book(questionId).odds0, 1e6);
        assertGt(house.book(questionId).odds1, 1e6);
    }

    function test_limit_expands_after_cover() public {
        (bytes32 questionId,) = _createActiveMarket("expand");
        vm.prank(player);
        house.addFunds(2000e6, acc);
        vm.prank(player);
        house.placeBet(questionId, 100e6, 0, acc);
        assertEq(house.maxBetOf(questionId, 0), 0);

        vm.prank(playerB);
        house.addFunds(200e6, accB);
        vm.prank(playerB);
        house.placeBet(questionId, 50e6, 1, accB);

        uint256 more = house.maxBetOf(questionId, 0);
        assertGt(more, 0);
        vm.prank(player);
        house.placeBet(questionId, more, 0, acc);
    }

    function test_later_bets_do_not_change_locked_payout() public {
        (bytes32 questionId,) = _createActiveMarket("lock-odds");
        vm.prank(player);
        house.addFunds(200e6, acc);
        vm.prank(playerB);
        house.addFunds(200e6, accB);

        vm.prank(player);
        house.placeBet(questionId, 50e6, 0, acc);
        (,, uint256 pending0,) = house.positionOf(questionId, player, acc);
        assertEq(pending0, 0);

        vm.prank(playerB);
        house.placeBet(questionId, 50e6, 1, accB);

        (uint256 s0,, uint256 locked0,) = house.positionOf(questionId, player, acc);
        assertEq(s0, 50e6);
        assertEq(locked0, 95e6);

        vm.prank(playerB);
        house.placeBet(questionId, 20e6, 1, accB);

        (,, uint256 stillLocked,) = house.positionOf(questionId, player, acc);
        assertEq(stillLocked, 95e6);
    }
}
