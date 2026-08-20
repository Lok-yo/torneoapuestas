// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IConditionalTokens
/// @notice Minimal interface for the deployed Gnosis `ConditionalTokens` (CTF)
/// singleton. Only the subset MarketFactory/ResolutionAdapter call is
/// declared here — this repo never redeploys or re-implements CTF itself.
/// See design.md Decision 3 (ID scheme) and Decision 1 (reuse audited CTF).
interface IConditionalTokens {
    /// @notice Registers a new condition, callable only once per
    /// (oracle, questionId, outcomeSlotCount) triple.
    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external;

    /// @notice Reports the payout vector for a condition. Only the
    /// registered `oracle` (the ResolutionAdapter, per Decision 3) may call
    /// this for a given conditionId.
    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external;

    /// @notice Splits `amount` of collateral into a full set of outcome
    /// positions for `conditionId`, or a partial set restricted by
    /// `partition`.
    function splitPosition(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external;

    /// @notice Merges outcome positions back into collateral (inverse of
    /// splitPosition).
    function mergePositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external;

    /// @notice Redeems positions for `msg.sender` once a condition has been
    /// resolved via `reportPayouts`, paying out collateral proportional to
    /// held winning-outcome shares.
    function redeemPositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external;

    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        external
        pure
        returns (bytes32);

    function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet)
        external
        view
        returns (bytes32);

    function getPositionId(address collateralToken, bytes32 collectionId) external pure returns (uint256);

    function payoutDenominator(bytes32 conditionId) external view returns (uint256);

    function balanceOf(address owner, uint256 positionId) external view returns (uint256);

    function setApprovalForAll(address operator, bool approved) external;

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata data) external;
}
