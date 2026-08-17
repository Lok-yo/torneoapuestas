// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IConditionalTokens} from "../../src/interfaces/IConditionalTokens.sol";
import {IFPMM} from "../../src/interfaces/IFPMM.sol";

/// @notice Test-only, simplified constant-product (CPMM) market maker
/// over two CTF outcome positions of one binary condition — mirrors
/// Gnosis FixedProductMarketMaker's externally observable pricing
/// behavior (design.md Decision 1: price shift proportional to trade size
/// relative to pool depth) without vendoring the real contract's full
/// dependency tree. Real deployment always targets either a canonical
/// Amoy FPMM factory or an on-source Gnosis FPMM deploy (design.md Open
/// Questions), never this mock.
contract MockFPMM is ERC20, IFPMM {
    IConditionalTokens public immutable ctf;
    IERC20 public immutable collateral;
    bytes32 public immutable conditionId;
    uint256 public immutable fee; // 1e18-scaled

    uint256[2] public reserves;

    error UnsupportedOutcomeIndex();

    constructor(IConditionalTokens _ctf, IERC20 _collateral, bytes32 _conditionId, uint256 _fee)
        ERC20("FPMM LP Share", "FPMM-LP")
    {
        ctf = _ctf;
        collateral = _collateral;
        conditionId = _conditionId;
        fee = _fee;
    }

    function initialize(address, address, bytes32[] calldata, uint256) external pure {
        // No-op: this mock is constructed fully initialized. Real Gnosis
        // FPMM factories call `initialize` post-clone; kept here only to
        // satisfy the IFPMM interface shape.
    }

    function addFunding(uint256 addedFunds, uint256[] calldata) external {
        collateral.transferFrom(msg.sender, address(this), addedFunds);

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        collateral.approve(address(ctf), addedFunds);
        ctf.splitPosition(address(collateral), bytes32(0), conditionId, partition, addedFunds);

        uint256 lpToMint = totalSupply() == 0 ? addedFunds : addedFunds;
        reserves[0] += addedFunds;
        reserves[1] += addedFunds;
        _mint(msg.sender, lpToMint);
    }

    function removeFunding(uint256 sharesToBurn) external {
        uint256 supply = totalSupply();
        uint256 share0 = (reserves[0] * sharesToBurn) / supply;
        uint256 share1 = (reserves[1] * sharesToBurn) / supply;
        uint256 removable = share0 < share1 ? share0 : share1;

        _burn(msg.sender, sharesToBurn);
        reserves[0] -= removable;
        reserves[1] -= removable;

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        ctf.mergePositions(address(collateral), bytes32(0), conditionId, partition, removable);
        collateral.transfer(msg.sender, removable);

        // Any leftover imbalance (share0 != share1) is transferred to the
        // LP as raw outcome-token dust, mirroring Gnosis FPMM's
        // `removeFunding` partial-imbalance behavior.
    }

    function calcBuyAmount(uint256 investmentAmount, uint256 outcomeIndex) public view returns (uint256) {
        if (outcomeIndex > 1) revert UnsupportedOutcomeIndex();
        uint256 investmentMinusFee = investmentAmount - _feeAmount(investmentAmount);
        uint256 otherIndex = outcomeIndex == 0 ? 1 : 0;

        uint256 buyTokenReserve = reserves[outcomeIndex] + investmentMinusFee;
        uint256 otherReserve = reserves[otherIndex] + investmentMinusFee;
        uint256 product = reserves[0] * reserves[1];
        uint256 newBuyTokenReserve = product / otherReserve;

        return buyTokenReserve - newBuyTokenReserve;
    }

    function calcSellAmount(uint256 returnAmount, uint256 outcomeIndex) public view returns (uint256) {
        if (outcomeIndex > 1) revert UnsupportedOutcomeIndex();
        uint256 returnPlusFeeNumerator = returnAmount * 1e18;
        uint256 returnAmountPlusFee = returnPlusFeeNumerator / (1e18 - fee) + 1;
        uint256 otherIndex = outcomeIndex == 0 ? 1 : 0;

        uint256 sellTokenReserve = reserves[outcomeIndex] - returnAmountPlusFee;
        uint256 otherReserve = reserves[otherIndex] - returnAmountPlusFee;
        uint256 product = reserves[0] * reserves[1];
        uint256 newSellTokenReserve = product / otherReserve;

        return newSellTokenReserve - sellTokenReserve;
    }

    function buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy) external {
        if (outcomeIndex > 1) revert UnsupportedOutcomeIndex();
        uint256 buyAmount = calcBuyAmount(investmentAmount, outcomeIndex);
        require(buyAmount >= minOutcomeTokensToBuy, "MockFPMM: slippage");

        collateral.transferFrom(msg.sender, address(this), investmentAmount);
        uint256 investmentMinusFee = investmentAmount - _feeAmount(investmentAmount);

        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        collateral.approve(address(ctf), investmentMinusFee);
        ctf.splitPosition(address(collateral), bytes32(0), conditionId, partition, investmentMinusFee);

        reserves[0] += investmentMinusFee;
        reserves[1] += investmentMinusFee;
        reserves[outcomeIndex] -= buyAmount;

        uint256 positionId = _positionIdFor(outcomeIndex);
        ctf.safeTransferFrom(address(this), msg.sender, positionId, buyAmount, "");
    }

    function sell(uint256 returnAmount, uint256 outcomeIndex, uint256 maxOutcomeTokensToSell) external {
        if (outcomeIndex > 1) revert UnsupportedOutcomeIndex();
        uint256 sellAmount = calcSellAmount(returnAmount, outcomeIndex);
        require(sellAmount <= maxOutcomeTokensToSell, "MockFPMM: slippage");

        uint256 positionId = _positionIdFor(outcomeIndex);
        ctf.safeTransferFrom(msg.sender, address(this), positionId, sellAmount, "");

        uint256 returnAmountPlusFee = (returnAmount * 1e18) / (1e18 - fee) + 1;
        uint256[] memory partition = new uint256[](2);
        partition[0] = 1;
        partition[1] = 2;
        ctf.mergePositions(address(collateral), bytes32(0), conditionId, partition, returnAmountPlusFee);

        reserves[0] -= returnAmountPlusFee;
        reserves[1] -= returnAmountPlusFee;
        reserves[outcomeIndex] += sellAmount;

        collateral.transfer(msg.sender, returnAmount);
    }

    function _positionIdFor(uint256 outcomeIndex) internal view returns (uint256) {
        uint256 indexSet = outcomeIndex == 0 ? 1 : 2;
        bytes32 collectionId = ctf.getCollectionId(bytes32(0), conditionId, indexSet);
        return ctf.getPositionId(address(collateral), collectionId);
    }

    function _feeAmount(uint256 investmentAmount) internal view returns (uint256) {
        return (investmentAmount * fee) / 1e18;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
}
