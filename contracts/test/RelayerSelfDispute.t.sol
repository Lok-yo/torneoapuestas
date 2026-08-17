// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Proves the relayer can never dispute its own posted result — the one
// checked-in participant with privileged posting rights must not also be
// able to grief/stall its own result via self-dispute. See tasks.md 5.4
// and oracle-resolution spec "Bond-Staked Dispute".

import {Fixtures} from "./Fixtures.sol";
import {ResolutionAdapter} from "../src/ResolutionAdapter.sol";

contract RelayerSelfDisputeTest is Fixtures {
    function test_relayer_cannotDisputeOwnPosting() public {
        (bytes32 questionId,) = _createActiveMarket(bytes32("self-dispute-outcome"));

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("result-ref"));

        vm.prank(relayer);
        vm.expectRevert(ResolutionAdapter.RelayerSelfDispute.selector);
        adapter.disputeResult(questionId);
    }

    function test_nonRelayer_canDispute() public {
        (bytes32 questionId,) = _createActiveMarket(bytes32("third-party-dispute-outcome"));

        vm.prank(relayer);
        adapter.postResult(questionId, 0, bytes32("result-ref"));

        vm.prank(challenger);
        adapter.disputeResult(questionId);
    }
}
