// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConditionalTokens} from "../../src/interfaces/IConditionalTokens.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Test-only, simplified stand-in for the deployed Gnosis
/// `ConditionalTokens` singleton. Implements exactly the subset of CTF
/// behavior `MarketFactory`/`ResolutionAdapter` depend on (binary
/// conditions only, matching design.md Decision 2) with a minimal internal
/// ERC-1155-style balance ledger — real mainnet/testnet deployment always
/// targets the actual audited CTF singleton (Decision 1); this mock exists
/// solely so Forge tests can run without vendoring the full
/// conditional-tokens-contracts repo and its own dependency tree.
contract MockConditionalTokens is IConditionalTokens {
    mapping(bytes32 => address) public oracleOf; // conditionId => oracle
    mapping(bytes32 => uint256) public outcomeSlotCountOf; // conditionId => slot count
    mapping(bytes32 => uint256[]) internal payoutNumeratorsOf; // conditionId => payouts
    mapping(bytes32 => uint256) public payoutDenominator;
    mapping(bytes32 => bool) public conditionPrepared;

    mapping(address => mapping(uint256 => uint256)) internal balances; // owner => positionId => balance
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    error ConditionAlreadyPrepared();
    error ConditionNotPrepared();
    error NotOracle();
    error AlreadyReported();
    error NotApproved();
    error InsufficientBalance();

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external {
        bytes32 conditionId = getConditionId(oracle, questionId, outcomeSlotCount);
        if (conditionPrepared[conditionId]) revert ConditionAlreadyPrepared();
        conditionPrepared[conditionId] = true;
        oracleOf[conditionId] = oracle;
        outcomeSlotCountOf[conditionId] = outcomeSlotCount;
    }

    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external {
        // Real CTF derives conditionId from (msg.sender, questionId,
        // payouts.length) — the oracle IS msg.sender, matching design.md
        // Decision 3 ("adapter as oracle means only ResolutionAdapter can
        // reportPayouts").
        bytes32 conditionId = getConditionId(msg.sender, questionId, payouts.length);
        if (!conditionPrepared[conditionId]) revert ConditionNotPrepared();
        if (payoutDenominator[conditionId] != 0) revert AlreadyReported();

        uint256 denom;
        for (uint256 i = 0; i < payouts.length; i++) {
            denom += payouts[i];
        }
        payoutNumeratorsOf[conditionId] = payouts;
        payoutDenominator[conditionId] = denom;
    }

    function splitPosition(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external {
        if (parentCollectionId == bytes32(0)) {
            IERC20(collateralToken).transferFrom(msg.sender, address(this), amount);
        }
        for (uint256 i = 0; i < partition.length; i++) {
            bytes32 collectionId = getCollectionId(parentCollectionId, conditionId, partition[i]);
            uint256 positionId = getPositionId(collateralToken, collectionId);
            balances[msg.sender][positionId] += amount;
        }
    }

    function mergePositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata partition,
        uint256 amount
    ) external {
        for (uint256 i = 0; i < partition.length; i++) {
            bytes32 collectionId = getCollectionId(parentCollectionId, conditionId, partition[i]);
            uint256 positionId = getPositionId(collateralToken, collectionId);
            if (balances[msg.sender][positionId] < amount) revert InsufficientBalance();
            balances[msg.sender][positionId] -= amount;
        }
        if (parentCollectionId == bytes32(0)) {
            IERC20(collateralToken).transfer(msg.sender, amount);
        }
    }

    function redeemPositions(
        address collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external {
        uint256 denom = payoutDenominator[conditionId];
        if (denom == 0) revert ConditionNotPrepared();
        uint256[] storage numerators = payoutNumeratorsOf[conditionId];

        uint256 totalPayout;
        for (uint256 i = 0; i < indexSets.length; i++) {
            bytes32 collectionId = getCollectionId(parentCollectionId, conditionId, indexSets[i]);
            uint256 positionId = getPositionId(collateralToken, collectionId);
            uint256 bal = balances[msg.sender][positionId];
            if (bal == 0) continue;
            balances[msg.sender][positionId] = 0;

            uint256 outcomeIndex = _indexSetToOutcomeIndex(indexSets[i]);
            totalPayout += (bal * numerators[outcomeIndex]) / denom;
        }

        if (totalPayout > 0) {
            IERC20(collateralToken).transfer(msg.sender, totalPayout);
        }
    }

    function _indexSetToOutcomeIndex(uint256 indexSet) internal pure returns (uint256) {
        // Binary conditions only (Decision 2): indexSet 1 => outcome 0,
        // indexSet 2 => outcome 1.
        return indexSet == 1 ? 0 : 1;
    }

    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
    }

    function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(parentCollectionId, conditionId, indexSet));
    }

    function getPositionId(address collateralToken, bytes32 collectionId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(collateralToken, collectionId)));
    }

    function balanceOf(address owner, uint256 positionId) public view returns (uint256) {
        return balances[owner][positionId];
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes calldata) external {
        if (from != msg.sender && !isApprovedForAll[from][msg.sender]) revert NotApproved();
        if (balances[from][id] < value) revert InsufficientBalance();
        balances[from][id] -= value;
        balances[to][id] += value;
    }

    /// @dev Test helper: lets tests seed a wallet's outcome-position
    /// balance directly without routing through splitPosition.
    function seedPositionBalance(address to, uint256 positionId, uint256 amount) external {
        balances[to][positionId] += amount;
    }
}
