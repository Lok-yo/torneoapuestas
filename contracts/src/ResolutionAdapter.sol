// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConditionalTokens} from "./interfaces/IConditionalTokens.sol";
import {ISanctionsList} from "./interfaces/ISanctionsList.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ResolutionAdapter
/// @notice The registered CTF oracle for every market `MarketFactory`
/// creates (Decision 3: `adapter` as oracle means only this contract can
/// ever call `reportPayouts`). Implements relayer result posting, a
/// permissionless challenge window, bond-staked disputes, and MVP
/// multisig arbitration. Real UMA Optimistic Oracle integration is
/// explicitly deferred (proposal.md Out of Scope). See specs
/// `oracle-resolution` + `wallet-identity`.
contract ResolutionAdapter {
    using SafeERC20 for IERC20;

    enum ResultState {
        NONE,
        PROPOSED,
        DISPUTED,
        SETTLED
    }

    struct Resolution {
        uint8 winningIndex;
        bytes32 resultRef;
        uint256 postedAt;
        ResultState state;
        address disputer;
        uint256 disputeBond;
    }

    /// Testnet-calibrated, maintainer-adjustable per design.md Parameters
    /// table. USDC uses 6 decimals.
    uint256 public constant CHALLENGE_WINDOW = 4 hours;
    uint256 public constant DISPUTE_BOND = 100e6;
    uint256 public constant DISPUTE_REWARD = 20e6;

    address public immutable owner;
    address public multisig;
    address public relayer;
    IConditionalTokens public immutable ctf;
    IERC20 public immutable collateral;
    ISanctionsList public sanctionsOracle;

    mapping(bytes32 => Resolution) public resolutions;
    uint256 public relayerStakeBalance;

    event RelayerStakeFunded(address indexed funder, uint256 amount);
    event ResultPosted(bytes32 indexed questionId, uint8 winningIndex, bytes32 resultRef);
    event ResultDisputed(bytes32 indexed questionId, address indexed disputer);
    event ResultRuled(bytes32 indexed questionId, uint8 winningIndex, bool overturned);
    event ResultSettled(bytes32 indexed questionId, uint8 winningIndex);
    event Redeemed(bytes32 indexed questionId, address indexed trader, uint256 amount);

    error NotOwner();
    error NotMultisig();
    error NotRelayer();
    error Sanctioned(address who);
    error AlreadyResolved(bytes32 questionId);
    error NotProposed(bytes32 questionId);
    error NotDisputed(bytes32 questionId);
    error NotSettled(bytes32 questionId);
    error WindowElapsed(bytes32 questionId);
    error WindowNotElapsed(bytes32 questionId);
    error RelayerSelfDispute();
    error InvalidOutcome(uint8 winningIndex);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMultisig() {
        if (msg.sender != multisig) revert NotMultisig();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    /// @dev Fails CLOSED — see MarketFactory's identical modifier and
    /// contracts/test/SanctionsFailClosed.t.sol.
    modifier notSanctioned(address who) {
        if (address(sanctionsOracle) == address(0)) revert Sanctioned(who);
        if (sanctionsOracle.isSanctioned(who)) revert Sanctioned(who);
        _;
    }

    constructor(
        IConditionalTokens _ctf,
        IERC20 _collateral,
        ISanctionsList _sanctionsOracle,
        address _multisig,
        address _relayer
    ) {
        owner = msg.sender;
        ctf = _ctf;
        collateral = _collateral;
        sanctionsOracle = _sanctionsOracle;
        multisig = _multisig;
        relayer = _relayer;
    }

    function setSanctionsOracle(ISanctionsList _oracle) external onlyOwner {
        sanctionsOracle = _oracle;
    }

    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }

    function setMultisig(address _multisig) external onlyOwner {
        multisig = _multisig;
    }

    /// @notice Funds the relayer's global stake (design.md Parameters:
    /// 1000 USDC), from which a dispute-overturn reward is paid.
    function fundRelayerStake(uint256 amount) external {
        collateral.safeTransferFrom(msg.sender, address(this), amount);
        relayerStakeBalance += amount;
        emit RelayerStakeFunded(msg.sender, amount);
    }

    /// @notice Relayer posts a start.gg-sourced result, opening the
    /// challenge window. See spec "Relayer posts a result".
    function postResult(bytes32 questionId, uint8 winningIndex, bytes32 resultRef) external onlyRelayer {
        if (winningIndex > 1) revert InvalidOutcome(winningIndex);
        Resolution storage r = resolutions[questionId];
        if (r.state != ResultState.NONE) revert AlreadyResolved(questionId);

        r.winningIndex = winningIndex;
        r.resultRef = resultRef;
        r.postedAt = block.timestamp;
        r.state = ResultState.PROPOSED;

        emit ResultPosted(questionId, winningIndex, resultRef);
    }

    /// @notice Any wallet other than the relayer may dispute a posted
    /// result inside its challenge window by locking `DISPUTE_BOND`. See
    /// spec "Dispute filed with bond" and
    /// contracts/test/RelayerSelfDispute.t.sol (GREEN for RED 2.3's
    /// sibling case: relayer self-dispute always reverts).
    function disputeResult(bytes32 questionId) external notSanctioned(msg.sender) {
        if (msg.sender == relayer) revert RelayerSelfDispute();
        Resolution storage r = resolutions[questionId];
        if (r.state != ResultState.PROPOSED) revert NotProposed(questionId);
        if (block.timestamp >= r.postedAt + CHALLENGE_WINDOW) revert WindowElapsed(questionId);

        collateral.safeTransferFrom(msg.sender, address(this), DISPUTE_BOND);

        r.disputer = msg.sender;
        r.disputeBond = DISPUTE_BOND;
        r.state = ResultState.DISPUTED;

        emit ResultDisputed(questionId, msg.sender);
    }

    /// @notice MVP multisig arbitration of a disputed result.
    /// `upheld = true`: confirms the relayer's original outcome — the
    /// disputer's bond is forfeited to the protocol.
    /// `upheld = false`: overturns to `winningIndex` — the disputer's bond
    /// is refunded plus a reward drawn from the relayer's stake.
    /// Either way the resolution re-enters PROPOSED with its challenge
    /// window collapsed to zero, so `settle()` becomes immediately
    /// callable on the multisig-determined outcome. See spec "Multisig
    /// upholds relayer result" / "Multisig overturns relayer result".
    function rule(bytes32 questionId, uint8 winningIndex, bool upheld) external onlyMultisig {
        if (winningIndex > 1) revert InvalidOutcome(winningIndex);
        Resolution storage r = resolutions[questionId];
        if (r.state != ResultState.DISPUTED) revert NotDisputed(questionId);

        if (!upheld) {
            r.winningIndex = winningIndex;
            if (relayerStakeBalance >= DISPUTE_REWARD) {
                relayerStakeBalance -= DISPUTE_REWARD;
                collateral.safeTransfer(r.disputer, r.disputeBond + DISPUTE_REWARD);
            } else {
                collateral.safeTransfer(r.disputer, r.disputeBond);
            }
        }
        // upheld == true: disputer's bond stays escrowed here (forfeited
        // to the protocol) — no transfer.

        r.state = ResultState.PROPOSED;
        // Collapses the challenge window to zero so settle() is
        // immediately callable on the multisig-determined outcome.
        // Saturating subtraction avoids underflow when block.timestamp is
        // still smaller than CHALLENGE_WINDOW (e.g. early-chain/test time).
        r.postedAt = block.timestamp > CHALLENGE_WINDOW ? block.timestamp - CHALLENGE_WINDOW : 0;

        emit ResultRuled(questionId, r.winningIndex, !upheld);
    }

    /// @notice Finalizes a PROPOSED (undisputed, or post-ruling) result by
    /// reporting the payout vector to CTF. Reverts inside the challenge
    /// window. See spec "Settlement blocked mid-window" /
    /// "Result finalizes unchallenged".
    function settle(bytes32 questionId) external {
        Resolution storage r = resolutions[questionId];
        if (r.state != ResultState.PROPOSED) revert NotProposed(questionId);
        if (block.timestamp < r.postedAt + CHALLENGE_WINDOW) revert WindowNotElapsed(questionId);

        r.state = ResultState.SETTLED;

        uint256[] memory payouts = new uint256[](2);
        payouts[r.winningIndex] = 1;
        payouts[r.winningIndex == 0 ? 1 : 0] = 0;

        ctf.reportPayouts(questionId, payouts);

        emit ResultSettled(questionId, r.winningIndex);
    }

    /// @notice notSanctioned-gated router around CTF.redeemPositions.
    /// Callers MUST first `ctf.setApprovalForAll(resolutionAdapter,
    /// true)` — this contract pulls the caller's winning-outcome position
    /// before redeeming so the collateral CTF pays out lands here first,
    /// then forwards it to the real trader (CTF pays whoever calls
    /// `redeemPositions`, which must be this contract for the sanctions
    /// gate to apply). See spec "Sanctioned address rejected at
    /// redemption".
    function redeem(bytes32 questionId, uint256[] calldata indexSets) external notSanctioned(msg.sender) {
        Resolution storage r = resolutions[questionId];
        if (r.state != ResultState.SETTLED) revert NotSettled(questionId);

        bytes32 conditionId = questionIdToConditionId(questionId);
        for (uint256 i = 0; i < indexSets.length; i++) {
            bytes32 collectionId = ctf.getCollectionId(bytes32(0), conditionId, indexSets[i]);
            uint256 positionId = ctf.getPositionId(address(collateral), collectionId);
            uint256 balance = ctf.balanceOf(msg.sender, positionId);
            if (balance > 0) {
                ctf.safeTransferFrom(msg.sender, address(this), positionId, balance, "");
            }
        }

        uint256 before = collateral.balanceOf(address(this));
        ctf.redeemPositions(address(collateral), bytes32(0), conditionId, indexSets);
        uint256 received = collateral.balanceOf(address(this)) - before;

        if (received > 0) {
            collateral.safeTransfer(msg.sender, received);
        }

        emit Redeemed(questionId, msg.sender, received);
    }

    function questionIdToConditionId(bytes32 questionId) public view returns (bytes32) {
        return ctf.getConditionId(address(this), questionId, 2);
    }

    /// @dev Required so `ctf.safeTransferFrom(..., address(this), ...)`
    /// (used by `redeem`) succeeds against a standard ERC-1155 CTF
    /// implementation.
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
