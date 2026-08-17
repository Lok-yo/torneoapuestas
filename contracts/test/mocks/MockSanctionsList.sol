// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISanctionsList} from "../../src/interfaces/ISanctionsList.sol";

/// @notice Test-only owner-settable sanctions oracle, mirroring the
/// owner-settable Amoy mock design.md Decision 6 describes for testnet.
contract MockSanctionsList is ISanctionsList {
    mapping(address => bool) public sanctioned;

    function setSanctioned(address who, bool value) external {
        sanctioned[who] = value;
    }

    function isSanctioned(address addr) external view returns (bool) {
        return sanctioned[addr];
    }
}
