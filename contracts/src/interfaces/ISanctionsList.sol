// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISanctionsList
/// @notice Address-level sanctions oracle. Mirrors the Chainalysis
/// `SanctionsList` contract's shape so the same modifier code works
/// against the real mainnet oracle or an owner-settable Amoy mock. See
/// design.md Decision 6: the `notSanctioned` modifier fails CLOSED — an
/// unset (zero-address) oracle reverts every trade/create/redeem instead
/// of silently permitting them.
interface ISanctionsList {
    /// @return true if `addr` is flagged as sanctioned.
    function isSanctioned(address addr) external view returns (bool);
}
