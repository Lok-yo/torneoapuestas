// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IConditionalTokens} from "./interfaces/IConditionalTokens.sol";
import {MarketFactory} from "./MarketFactory.sol";
import {ResolutionAdapter} from "./ResolutionAdapter.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
}

/// @title HouseBank
/// @notice Bankroll is keyed by (wallet, accountId) so two Google accounts
/// sharing MetaMask do not share deposits or bets.
contract HouseBank {
    using SafeERC20 for IERC20;

    struct Bet {
        address user;
        bytes32 accountId;
        uint256 outcomeIndex;
        uint256 stake;
        uint256 shares;
        uint256 placedAt;
    }

    struct Account {
        uint256 balance;
        uint256 deposited;
        uint256 inPlay;
        uint256 withdrawable;
    }

    struct Book {
        uint256 stake0;
        uint256 stake1;
        uint256 odds0;
        uint256 odds1;
        bool executable;
        bool settled;
        bool voided;
    }

    IERC20 public immutable usdc;
    MarketFactory public immutable factory;
    ResolutionAdapter public immutable adapter;
    IConditionalTokens public immutable ctf;

    uint256 public constant HOUSE_BPS = 500;
    uint256 public constant MIN_WIN_BPS = 100;
    uint256 public constant OPENING_MAX = 100e6;
    uint256 public constant MIN_BET = 1e6;
    uint256 public constant CANCEL_WINDOW = 10 minutes;

    mapping(bytes32 => uint256) public balance;
    mapping(bytes32 => uint256) public deposited;
    mapping(bytes32 => uint256) public inPlay;
    mapping(bytes32 => Bet[]) public marketBets;
    mapping(bytes32 => bool) public claimed;
    mapping(bytes32 => bool) public voided;
    mapping(bytes32 => uint256[2]) public sideStake;
    mapping(bytes32 => mapping(bytes32 => uint256[2])) public userStake;
    mapping(bytes32 => mapping(bytes32 => uint8)) public userSide;
    uint256 public houseTake;

    event FundsAdded(address indexed user, bytes32 indexed accountId, uint256 amount);
    event BetPlaced(
        address indexed user,
        bytes32 indexed questionId,
        bytes32 indexed accountId,
        uint256 outcomeIndex,
        uint256 amount
    );
    event ProfitsWithdrawn(address indexed user, bytes32 indexed accountId, uint256 amount);
    event WinningsCredited(address indexed user, bytes32 indexed questionId, uint256 amount);
    event MarketClaimed(bytes32 indexed questionId, uint256 received);
    event MarketVoided(bytes32 indexed questionId, uint256 refunded);
    event LineOpened(address indexed user, bytes32 indexed questionId, uint256 amount);
    event BetCancelled(address indexed user, bytes32 indexed questionId, bytes32 indexed accountId, uint256 amount);

    error ZeroAmount();
    error InsufficientBalance();
    error ExceedsProfits();
    error NotSettled();
    error AlreadyClaimed();
    error AlreadyOnOtherSide();
    error MarketNotOpen();
    error InvalidOutcome();
    error MissingAccount();
    error CancelWindowClosed();
    error NoBetToCancel();
    error BetTooLarge();
    error BetTooSmall();

    constructor(IERC20 _usdc, MarketFactory _factory, ResolutionAdapter _adapter, IConditionalTokens _ctf) {
        usdc = _usdc;
        factory = _factory;
        adapter = _adapter;
        ctf = _ctf;
        usdc.approve(address(_factory), type(uint256).max);
        _ctf.setApprovalForAll(address(_adapter), true);
        _ctf.setApprovalForAll(address(_factory), true);
    }

    function _pid(address wallet, bytes32 accountId) internal pure returns (bytes32) {
        if (accountId == bytes32(0)) revert MissingAccount();
        return keccak256(abi.encode(wallet, accountId));
    }

    function withdrawable(address wallet, bytes32 accountId) public view returns (uint256) {
        bytes32 id = _pid(wallet, accountId);
        uint256 bal = balance[id];
        uint256 dep = deposited[id];
        return bal > dep ? bal - dep : 0;
    }

    function accountOf(address wallet, bytes32 accountId) external view returns (Account memory) {
        bytes32 id = _pid(wallet, accountId);
        uint256 bal = balance[id];
        uint256 dep = deposited[id];
        return Account({
            balance: bal,
            deposited: dep,
            inPlay: inPlay[id],
            withdrawable: bal > dep ? bal - dep : 0
        });
    }

    function pickOf(bytes32 questionId, address wallet, bytes32 accountId) external view returns (uint8) {
        return userSide[questionId][_pid(wallet, accountId)];
    }

    function addFunds(uint256 amount, bytes32 accountId) external {
        if (amount == 0) revert ZeroAmount();
        bytes32 id = _pid(msg.sender, accountId);
        try IMintableERC20(address(usdc)).mint(address(this), amount) {}
        catch {
            usdc.safeTransferFrom(msg.sender, address(this), amount);
        }
        balance[id] += amount;
        deposited[id] += amount;
        emit FundsAdded(msg.sender, accountId, amount);
    }

    function withdrawProfits(uint256 amount, bytes32 accountId) external {
        if (amount == 0) revert ZeroAmount();
        bytes32 id = _pid(msg.sender, accountId);
        uint256 max = withdrawable(msg.sender, accountId);
        if (amount > max) revert ExceedsProfits();
        balance[id] -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit ProfitsWithdrawn(msg.sender, accountId, amount);
    }

    /// @notice Opens the on-chain line. Seed/bond is minted locally so it
    /// does not consume the caller's betting bankroll.
    function createMarket(
        bytes32 questionId,
        uint256 startggEventId,
        uint8 marketType,
        uint256 seedLiquidity,
        uint256 eventStartsAt
    ) external {
        uint256 total = factory.CREATION_BOND() + seedLiquidity;
        if (total == 0) revert ZeroAmount();
        IMintableERC20(address(usdc)).mint(address(this), total);
        factory.createMarket(questionId, startggEventId, marketType, seedLiquidity, eventStartsAt);
        emit LineOpened(msg.sender, questionId, total);
    }

    function book(bytes32 questionId) external view returns (Book memory) {
        uint256 s0 = sideStake[questionId][0];
        uint256 s1 = sideStake[questionId][1];
        uint256 pool = s0 + s1;
        uint256 net = pool - (pool * HOUSE_BPS) / 10_000;
        return Book({
            stake0: s0,
            stake1: s1,
            odds0: s0 == 0 ? 0 : (net * 1e6) / s0,
            odds1: s1 == 0 ? 0 : (net * 1e6) / s1,
            executable: s0 > 0 && s1 > 0,
            settled: claimed[questionId],
            voided: voided[questionId]
        });
    }

    /// @notice First bets are capped at OPENING_MAX. After the other side
    /// covers, the cap grows with that stake so a winner still profits after
    /// the 5% house cut (taken only if both sides have money at settlement).
    function maxBetOf(bytes32 questionId, uint256 outcomeIndex) public view returns (uint256) {
        if (outcomeIndex > 1) revert InvalidOutcome();
        uint256 mine = sideStake[questionId][outcomeIndex];
        uint256 them = sideStake[questionId][1 - outcomeIndex];
        if (them == 0) {
            if (mine >= OPENING_MAX) return 0;
            return OPENING_MAX - mine;
        }
        uint256 cap = ((10_000 - HOUSE_BPS) * them) / (HOUSE_BPS + MIN_WIN_BPS);
        if (cap <= mine) return 0;
        return cap - mine;
    }

    /// @notice Cover must be large enough that the *other* side still profits
    /// if it wins. Prevents 10 USDC against a 5000 opener.
    function minBetOf(bytes32 questionId, uint256 outcomeIndex) public view returns (uint256) {
        if (outcomeIndex > 1) revert InvalidOutcome();
        uint256 mine = sideStake[questionId][outcomeIndex];
        uint256 them = sideStake[questionId][1 - outcomeIndex];
        if (them == 0) return MIN_BET;
        uint256 numer = 10_000 - HOUSE_BPS;
        uint256 denom = HOUSE_BPS + MIN_WIN_BPS;
        uint256 need = (them * denom + numer - 1) / numer;
        if (need <= mine) return MIN_BET;
        uint256 x = need - mine;
        return x < MIN_BET ? MIN_BET : x;
    }

    function placeBet(bytes32 questionId, uint256 amount, uint256 outcomeIndex, bytes32 accountId) external {
        if (amount == 0) revert ZeroAmount();
        if (outcomeIndex > 1) revert InvalidOutcome();
        if (claimed[questionId] || voided[questionId]) revert AlreadyClaimed();
        bytes32 id = _pid(msg.sender, accountId);
        if (amount < minBetOf(questionId, outcomeIndex)) revert BetTooSmall();
        if (amount > maxBetOf(questionId, outcomeIndex)) revert BetTooLarge();
        if (balance[id] < amount) revert InsufficientBalance();

        (,,,,, MarketFactory.MarketState state,,,,,) = factory.markets(questionId);
        if (state != MarketFactory.MarketState.ACTIVE) revert MarketNotOpen();

        uint8 existing = userSide[questionId][id];
        if (existing != 0 && existing != uint8(outcomeIndex + 1)) revert AlreadyOnOtherSide();

        balance[id] -= amount;
        inPlay[id] += amount;
        userSide[questionId][id] = uint8(outcomeIndex + 1);
        userStake[questionId][id][outcomeIndex] += amount;
        sideStake[questionId][outcomeIndex] += amount;

        marketBets[questionId].push(Bet(msg.sender, accountId, outcomeIndex, amount, amount, block.timestamp));
        emit BetPlaced(msg.sender, questionId, accountId, outcomeIndex, amount);
    }

    function cancelWindowOf(bytes32 questionId, address wallet, bytes32 accountId)
        external
        view
        returns (uint256 amount, uint256 deadline)
    {
        if (claimed[questionId] || voided[questionId]) return (0, 0);
        Bet[] storage bets = marketBets[questionId];
        uint256 latest;
        for (uint256 i = 0; i < bets.length; i++) {
            if (bets[i].user != wallet || bets[i].accountId != accountId || bets[i].stake == 0) continue;
            if (block.timestamp > bets[i].placedAt + CANCEL_WINDOW) continue;
            amount += bets[i].stake;
            if (bets[i].placedAt > latest) latest = bets[i].placedAt;
        }
        deadline = latest == 0 ? 0 : latest + CANCEL_WINDOW;
    }

    /// @notice Refund stake placed in the last 10 minutes. Older bets stay locked.
    function cancelBet(bytes32 questionId, bytes32 accountId) external {
        if (claimed[questionId] || voided[questionId]) revert AlreadyClaimed();
        bytes32 id = _pid(msg.sender, accountId);
        Bet[] storage bets = marketBets[questionId];
        uint256 refunded;
        bool had;
        for (uint256 i = 0; i < bets.length; i++) {
            if (bets[i].user != msg.sender || bets[i].accountId != accountId) continue;
            if (bets[i].stake == 0) continue;
            had = true;
            if (block.timestamp > bets[i].placedAt + CANCEL_WINDOW) continue;
            uint256 stake = bets[i].stake;
            uint256 outcome = bets[i].outcomeIndex;
            bets[i].stake = 0;
            sideStake[questionId][outcome] -= stake;
            userStake[questionId][id][outcome] -= stake;
            inPlay[id] -= stake;
            balance[id] += stake;
            refunded += stake;
        }
        if (refunded == 0) {
            if (had) revert CancelWindowClosed();
            revert NoBetToCancel();
        }
        if (userStake[questionId][id][0] + userStake[questionId][id][1] == 0) {
            userSide[questionId][id] = 0;
        }
        emit BetCancelled(msg.sender, questionId, accountId, refunded);
    }

    function claim(bytes32 questionId) external {
        if (claimed[questionId]) revert AlreadyClaimed();
        (uint8 winningIndex, , , ResolutionAdapter.ResultState state, , ) = adapter.resolutions(questionId);
        if (state != ResolutionAdapter.ResultState.SETTLED) revert NotSettled();

        claimed[questionId] = true;

        uint256 s0 = sideStake[questionId][0];
        uint256 s1 = sideStake[questionId][1];
        Bet[] storage bets = marketBets[questionId];

        if (s0 == 0 || s1 == 0) {
            voided[questionId] = true;
            uint256 refunded;
            for (uint256 i = 0; i < bets.length; i++) {
                if (bets[i].stake == 0) continue;
                bytes32 id = _pid(bets[i].user, bets[i].accountId);
                inPlay[id] -= bets[i].stake;
                balance[id] += bets[i].stake;
                refunded += bets[i].stake;
            }
            emit MarketVoided(questionId, refunded);
            emit MarketClaimed(questionId, 0);
            return;
        }

        uint256 pool = s0 + s1;
        uint256 cut = (pool * HOUSE_BPS) / 10_000;
        uint256 net = pool - cut;
        houseTake += cut;
        uint256 winPool = sideStake[questionId][winningIndex];

        for (uint256 i = 0; i < bets.length; i++) {
            if (bets[i].stake == 0) continue;
            bytes32 id = _pid(bets[i].user, bets[i].accountId);
            inPlay[id] -= bets[i].stake;
            if (bets[i].outcomeIndex != winningIndex || winPool == 0) continue;
            uint256 payout = (bets[i].stake * net) / winPool;
            if (payout == 0) continue;
            balance[id] += payout;
            emit WinningsCredited(bets[i].user, questionId, payout);
        }

        emit MarketClaimed(questionId, net);
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
