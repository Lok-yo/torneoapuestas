// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFPMM
/// @notice Minimal interface for Gnosis's `FixedProductMarketMaker` (CPMM
/// pricing over CTF outcome tokens). See design.md Decision 1: pricing is
/// reused from the audited FPMM implementation, never reimplemented here.
interface IFPMM {
    /// @notice One-time initializer deploying a market maker for a single
    /// CTF condition, seeded with `collateralToken` funding.
    function initialize(
        address conditionalTokens,
        address collateralToken,
        bytes32[] calldata conditionIds,
        uint256 fee
    ) external;

    /// @notice Adds funding (liquidity) to the pool, minting LP shares to
    /// `msg.sender`.
    function addFunding(uint256 addedFunds, uint256[] calldata distributionHint) external;

    /// @notice Removes `sharesToBurn` LP shares, returning underlying
    /// collateral + outcome tokens to `msg.sender`.
    function removeFunding(uint256 sharesToBurn) external;

    /// @notice Quotes the amount of `investmentAmount` collateral required
    /// to buy `outcomeTokensToBuy` of `outcomeIndex`.
    function calcBuyAmount(uint256 investmentAmount, uint256 outcomeIndex) external view returns (uint256);

    /// @notice Quotes the amount of collateral returned for selling
    /// `outcomeTokensToSell` of `outcomeIndex`.
    function calcSellAmount(uint256 returnAmount, uint256 outcomeIndex) external view returns (uint256);

    /// @notice Buys `minOutcomeTokensToBuy` of `outcomeIndex` for
    /// `investmentAmount` collateral, pulled from `msg.sender`.
    function buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy) external;

    /// @notice Sells `outcomeTokensToSell` of `outcomeIndex`, paying out at
    /// least `minReturnAmount` collateral to `msg.sender`.
    function sell(uint256 returnAmount, uint256 outcomeIndex, uint256 maxOutcomeTokensToSell) external;
}
