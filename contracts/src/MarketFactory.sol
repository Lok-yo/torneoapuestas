// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IConditionalTokens} from "./interfaces/IConditionalTokens.sol";
import {IFPMM} from "./interfaces/IFPMM.sol";
import {ISanctionsList} from "./interfaces/ISanctionsList.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Minimal factory interface for a deployed Gnosis
/// FixedProductMarketMaker factory. design.md leaves open whether a
/// canonical FPMM factory exists on Amoy; if not, `script/Deploy.s.sol`
/// deploys a compatible one from source and wires its address in here
/// (see design.md Open Questions).
interface IFPMMFactory {
    function createFixedProductMarketMaker(
        address conditionalTokens,
        address collateralToken,
        bytes32[] calldata conditionIds,
        uint256 fee
    ) external returns (address);
}

/// @title MarketFactory
/// @notice CTF-lite market creation + permissionless creation-bond
/// guardrail. Deploys one Gnosis FPMM per market for CPMM pricing
/// (Decision 1) and registers `ResolutionAdapter` as the CTF oracle so
/// only it can ever call `reportPayouts` for markets created here
/// (Decision 3). See design.md Flow 1 / Flow 2 and specs
/// `onchain-prediction-markets` + `wallet-identity`.
contract MarketFactory {
    using SafeERC20 for IERC20;

    enum MarketState {
        NONE,
        PENDING,
        CHALLENGED,
        ACTIVE,
        VOID
    }

    struct Market {
        bytes32 conditionId;
        uint256 startggEventId;
        uint8 marketType;
        address creator;
        address fpmm;
        MarketState state;
        uint256 windowEnds;
        uint256 creationBond;
        address challenger;
        uint256 challengeBond;
        uint256 challengedAt;
    }

    /// Testnet-calibrated, maintainer-adjustable per design.md Parameters
    /// table. USDC uses 6 decimals.
    uint256 public constant CREATION_BOND = 1e6;
    uint256 public constant CHALLENGER_BOND = 25e6;
    uint256 public constant MIN_LIQUIDITY = 100e6;
    uint256 public constant MAX_CREATION_WINDOW = 60 minutes;
    uint256 public constant CREATION_RULING_TIMEOUT = 7 days;
    uint256 public constant FPMM_FEE = 0.02e18; // 2%, Gnosis FPMM 1e18-scaled fee

    address public immutable owner;
    address public multisig;
    address public resolutionAdapter;
    address public treasury;
    IConditionalTokens public immutable ctf;
    IERC20 public immutable collateral;
    IFPMMFactory public immutable fpmmFactory;
    ISanctionsList public sanctionsOracle;

    mapping(bytes32 => Market) public markets;
    /// @dev Bridges the off-chain start.gg ingestion cache
    /// (`startgg_ingestion_cursor`/`onchain_markets` in Postgres) onto an
    /// on-chain guard: only event IDs the backend has actually ingested
    /// may be referenced by `createMarket`. Populated by an
    /// owner-controlled registrar (the same service identity that runs
    /// `startgg-poller`). See spec "Creation rejected for unknown event".
    mapping(uint256 => bool) public knownStartggEvents;

    event StartggEventRegistered(uint256 indexed startggEventId);
    event MarketCreated(
        bytes32 indexed questionId,
        bytes32 indexed conditionId,
        address indexed creator,
        address fpmm,
        uint256 startggEventId,
        uint8 marketType
    );
    event MarketChallenged(bytes32 indexed questionId, address indexed challenger);
    event MarketActivated(bytes32 indexed questionId);
    event MarketVoided(bytes32 indexed questionId);
    event CreationRuled(bytes32 indexed questionId, bool upheld);
    event SharesBought(
        bytes32 indexed questionId,
        address indexed trader,
        uint256 outcomeIndex,
        uint256 investmentAmount,
        uint256 outcomeTokens
    );
    event SharesSold(bytes32 indexed questionId, address indexed trader, uint256 outcomeIndex, uint256 returnAmount);

    error NotOwner();
    error NotMultisig();
    error ResolutionAdapterUnset();
    error Sanctioned(address who);
    error UnknownStartggEvent(uint256 startggEventId);
    error MarketAlreadyExists(bytes32 questionId);
    error InvalidState(MarketState expected, MarketState actual);
    error InsufficientLiquidity(uint256 supplied, uint256 minimum);
    error WindowElapsed(uint256 windowEnds);
    error WindowNotElapsed(uint256 windowEnds);
    error AlreadyChallenged();
    error TimeoutNotElapsed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMultisig() {
        if (msg.sender != multisig) revert NotMultisig();
        _;
    }

    /// @dev Fails CLOSED: an unset (zero-address) sanctions oracle reverts
    /// every gated call instead of silently permitting it. See design.md
    /// Decision 6 and contracts/test/SanctionsFailClosed.t.sol.
    modifier notSanctioned(address who) {
        if (address(sanctionsOracle) == address(0)) revert Sanctioned(who);
        if (sanctionsOracle.isSanctioned(who)) revert Sanctioned(who);
        _;
    }

    constructor(
        IConditionalTokens _ctf,
        IERC20 _collateral,
        IFPMMFactory _fpmmFactory,
        ISanctionsList _sanctionsOracle,
        address _multisig,
        address _treasury
    ) {
        owner = msg.sender;
        ctf = _ctf;
        collateral = _collateral;
        fpmmFactory = _fpmmFactory;
        sanctionsOracle = _sanctionsOracle;
        multisig = _multisig;
        treasury = _treasury;
    }

    function setResolutionAdapter(address _resolutionAdapter) external onlyOwner {
        resolutionAdapter = _resolutionAdapter;
    }

    function setSanctionsOracle(ISanctionsList _oracle) external onlyOwner {
        sanctionsOracle = _oracle;
    }

    function setMultisig(address _multisig) external onlyOwner {
        multisig = _multisig;
    }

    function registerStartggEvent(uint256 startggEventId) external onlyOwner {
        knownStartggEvents[startggEventId] = true;
        emit StartggEventRegistered(startggEventId);
    }

    /// @notice Creates a market for `startggEventId`/`marketType`, pulling
    /// the creation bond + seed liquidity from `msg.sender`.
    /// `questionId` MUST equal `keccak256(abi.encode(startggEventId,
    /// marketType, outcomeRef))` per design.md Decision 3 — the exact
    /// `outcomeRef` (entrant id / match id) is opaque to this contract;
    /// duplicate protection comes from `markets[questionId]` uniqueness,
    /// which two honest callers hashing the same event+outcome always
    /// collide on.
    /// @param eventStartsAt Unix timestamp start.gg reports for the
    /// referenced event/match; bounds the creation window to
    /// `min(60 minutes, eventStartsAt - now)` per design.md Parameters.
    function createMarket(
        bytes32 questionId,
        uint256 startggEventId,
        uint8 marketType,
        uint256 seedLiquidity,
        uint256 eventStartsAt
    ) external notSanctioned(msg.sender) returns (bytes32 conditionId) {
        if (resolutionAdapter == address(0)) revert ResolutionAdapterUnset();
        if (!knownStartggEvents[startggEventId]) revert UnknownStartggEvent(startggEventId);
        if (markets[questionId].state != MarketState.NONE) revert MarketAlreadyExists(questionId);
        if (seedLiquidity < MIN_LIQUIDITY) revert InsufficientLiquidity(seedLiquidity, MIN_LIQUIDITY);

        uint256 total = CREATION_BOND + seedLiquidity;
        collateral.safeTransferFrom(msg.sender, address(this), total);

        ctf.prepareCondition(resolutionAdapter, questionId, 2);
        conditionId = ctf.getConditionId(resolutionAdapter, questionId, 2);

        bytes32[] memory conditionIds = new bytes32[](1);
        conditionIds[0] = conditionId;
        address fpmm =
            fpmmFactory.createFixedProductMarketMaker(address(ctf), address(collateral), conditionIds, FPMM_FEE);

        collateral.approve(fpmm, seedLiquidity);
        uint256[] memory distributionHint = new uint256[](0);
        IFPMM(fpmm).addFunding(seedLiquidity, distributionHint);

        uint256 window = (eventStartsAt > block.timestamp && (eventStartsAt - block.timestamp) < MAX_CREATION_WINDOW)
            ? eventStartsAt - block.timestamp
            : MAX_CREATION_WINDOW;

        markets[questionId] = Market({
            conditionId: conditionId,
            startggEventId: startggEventId,
            marketType: marketType,
            creator: msg.sender,
            fpmm: fpmm,
            state: MarketState.PENDING,
            windowEnds: block.timestamp + window,
            creationBond: CREATION_BOND,
            challenger: address(0),
            challengeBond: 0,
            challengedAt: 0
        });

        emit MarketCreated(questionId, conditionId, msg.sender, fpmm, startggEventId, marketType);
    }

    /// @notice Challenges a PENDING market as duplicate/malformed, locking
    /// a matching bond and freezing activation pending multisig
    /// arbitration. See spec "Duplicate/malformed market challenged and
    /// bond slashed".
    function challengeCreation(bytes32 questionId) external notSanctioned(msg.sender) {
        Market storage m = markets[questionId];
        if (m.state != MarketState.PENDING) revert InvalidState(MarketState.PENDING, m.state);
        if (block.timestamp >= m.windowEnds) revert WindowElapsed(m.windowEnds);
        if (m.challenger != address(0)) revert AlreadyChallenged();

        collateral.safeTransferFrom(msg.sender, address(this), CHALLENGER_BOND);

        m.challenger = msg.sender;
        m.challengeBond = CHALLENGER_BOND;
        m.challengedAt = block.timestamp;
        m.state = MarketState.CHALLENGED;

        emit MarketChallenged(questionId, msg.sender);
    }

    /// @notice Multisig arbitration of a creation challenge.
    /// `upheld = true`: challenge is correct (duplicate/malformed) — the
    /// creator's bond is slashed 50/50 between challenger and treasury,
    /// the challenger's own bond is returned, and the market VOIDs (seed
    /// liquidity, not slashable, is returned to the creator).
    /// `upheld = false`: challenge was wrong — the challenger's bond goes
    /// to the creator and the market ACTIVATEs.
    function ruleCreation(bytes32 questionId, bool upheld) external onlyMultisig {
        Market storage m = markets[questionId];
        if (m.state != MarketState.CHALLENGED) revert InvalidState(MarketState.CHALLENGED, m.state);

        if (upheld) {
            uint256 half = m.creationBond / 2;
            collateral.safeTransfer(m.challenger, half + m.challengeBond);
            collateral.safeTransfer(treasury, m.creationBond - half);
            _void(questionId, m);
        } else {
            collateral.safeTransfer(m.creator, m.creationBond + m.challengeBond);
            m.state = MarketState.ACTIVE;
            emit MarketActivated(questionId);
        }

        emit CreationRuled(questionId, upheld);
    }

    /// @notice Fail-safe: if the multisig never rules within 7 days of a
    /// challenge, both bonds refund in full and the market VOIDs — it
    /// never silently becomes tradeable. See design.md Flow 2 "Timeout
    /// guard" and contracts/test/MultisigTimeout.t.sol.
    function timeoutCreationRuling(bytes32 questionId) external {
        Market storage m = markets[questionId];
        if (m.state != MarketState.CHALLENGED) revert InvalidState(MarketState.CHALLENGED, m.state);
        if (block.timestamp < m.challengedAt + CREATION_RULING_TIMEOUT) revert TimeoutNotElapsed();

        collateral.safeTransfer(m.creator, m.creationBond);
        collateral.safeTransfer(m.challenger, m.challengeBond);
        _void(questionId, m);
    }

    /// @notice Anyone may finalize an unchallenged PENDING market once its
    /// window elapses, activating it and refunding the creator's bond.
    function activateIfUnchallenged(bytes32 questionId) external {
        Market storage m = markets[questionId];
        if (m.state != MarketState.PENDING) revert InvalidState(MarketState.PENDING, m.state);
        if (block.timestamp < m.windowEnds) revert WindowNotElapsed(m.windowEnds);

        collateral.safeTransfer(m.creator, m.creationBond);
        m.state = MarketState.ACTIVE;
        emit MarketActivated(questionId);
    }

    function _void(bytes32 questionId, Market storage m) internal {
        m.state = MarketState.VOID;
        // Seed liquidity is not slashable (design.md Flow 2): the FPMM LP
        // shares minted to this contract at creation are handed back to
        // the creator so their seed collateral remains recoverable via
        // `IFPMM(fpmm).removeFunding(...)` even though the market never
        // becomes tradeable.
        uint256 lpBalance = IERC20(m.fpmm).balanceOf(address(this));
        if (lpBalance > 0) {
            IERC20(m.fpmm).safeTransfer(m.creator, lpBalance);
        }
        emit MarketVoided(questionId);
    }

    /// @notice notSanctioned-gated router around FPMM.buy, keeping CPMM
    /// pricing math entirely inside the audited FPMM (Decision 1) while
    /// enforcing sanctions screening at the trade boundary (Decision 6 /
    /// GREEN for SanctionsFailClosed.t.sol) and delivering the resulting
    /// ERC-1155 outcome position to the real trader rather than this
    /// contract.
    function buy(bytes32 questionId, uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy)
        external
        notSanctioned(msg.sender)
    {
        Market storage m = markets[questionId];
        if (m.state != MarketState.ACTIVE) revert InvalidState(MarketState.ACTIVE, m.state);

        collateral.safeTransferFrom(msg.sender, address(this), investmentAmount);
        collateral.approve(m.fpmm, investmentAmount);

        uint256 outcomeTokens = IFPMM(m.fpmm).calcBuyAmount(investmentAmount, outcomeIndex);
        IFPMM(m.fpmm).buy(investmentAmount, outcomeIndex, minOutcomeTokensToBuy);

        uint256 positionId = _positionIdFor(m.conditionId, outcomeIndex);
        ctf.safeTransferFrom(address(this), msg.sender, positionId, outcomeTokens, "");

        emit SharesBought(questionId, msg.sender, outcomeIndex, investmentAmount, outcomeTokens);
    }

    /// @notice notSanctioned-gated router around FPMM.sell. Callers MUST
    /// first `ctf.setApprovalForAll(marketFactory, true)` — this contract
    /// pulls the trader's outcome position via `safeTransferFrom` before
    /// forwarding to the FPMM, mirroring how ERC20 routers require a
    /// pre-trade `approve`.
    function sell(bytes32 questionId, uint256 returnAmount, uint256 outcomeIndex, uint256 maxOutcomeTokensToSell)
        external
        notSanctioned(msg.sender)
    {
        Market storage m = markets[questionId];
        if (m.state != MarketState.ACTIVE) revert InvalidState(MarketState.ACTIVE, m.state);

        uint256 positionId = _positionIdFor(m.conditionId, outcomeIndex);
        ctf.safeTransferFrom(msg.sender, address(this), positionId, maxOutcomeTokensToSell, "");

        IFPMM(m.fpmm).sell(returnAmount, outcomeIndex, maxOutcomeTokensToSell);
        collateral.safeTransfer(msg.sender, returnAmount);

        emit SharesSold(questionId, msg.sender, outcomeIndex, returnAmount);
    }

    function _positionIdFor(bytes32 conditionId, uint256 outcomeIndex) internal view returns (uint256) {
        uint256 indexSet = outcomeIndex == 0 ? 1 : 2;
        bytes32 collectionId = ctf.getCollectionId(bytes32(0), conditionId, indexSet);
        return ctf.getPositionId(address(collateral), collectionId);
    }

    /// @dev Required so `ctf.safeTransferFrom(..., address(this), ...)`
    /// (used by `sell`) succeeds against a standard ERC-1155 CTF
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
