// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {FullMath} from "./libraries/FullMath.sol";

interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// @title TrustPool
/// @notice Pooled calls. A caller opens a call on one token with every rule fixed up front.
/// For a short window anyone can deposit MON into the call's pool and take it back. When the
/// window closes the caller runs one buy for the whole pool, so everyone gets the same entry.
/// Anyone (a keeper) sells the whole position once a rule fixed at open is met: take-profit,
/// stop-loss or max hold. Everyone gets the same exit and claims pro rata. The caller earns a
/// share of profit only, and the net result to participants goes on the caller's record.
/// @dev Every rule of a call, the adapter and every timing param are copied into the call when
/// it opens. Admin changes apply to later calls only, so the admin has no path to MON or tokens
/// held for a call. See docs/product.md.
contract TrustPool {
    enum State {
        None,
        Open, // window open: deposits and withdrawals; after it closes, waiting for the buy
        Holding, // bought; waiting for a sale condition
        Settled, // sold; participants claim MON
        Refunded, // never bought; participants claim their deposits 1:1
        Split // the sale kept failing; participants claim tokens
    }

    /// @dev Fixed at open. Nothing in here can change afterwards, by anyone.
    struct Rules {
        ISwapAdapter adapter;
        uint40 windowEnd; // deposits and withdrawals until here
        uint40 buyDeadline; // the caller must buy before this
        uint32 maxHold; // seconds from the buy until anyone may sell regardless of price
        uint32 takeProfitBps; // above entry; 0 = none
        uint16 stopLossBps; // below entry
        uint16 shareBps; // caller's share of profit
        uint16 minCallerBps; // caller's least stake in the pool at the buy
        uint16 maxImpactBps; // price impact limit of the buy
        uint16 sellToleranceBps; // the sale may return this much less than the checkpoint
        uint16 keeperBps; // keeper reward, of gross proceeds
        uint32 checkpointGap; // least time between checkpoints
        uint32 splitGrace; // after max hold, before the tokens can be split unsold
        uint128 cap; // bond x tier multiple, at open
        uint128 minPool;
    }

    struct Checkpoint {
        uint128 value; // MON that selling the whole position would return, quoted
        uint40 at;
    }

    struct Call {
        address caller;
        uint40 openedAt;
        State state;
        address token;
        Rules rules;
        uint128 totalIn; // MON deposited, all participants
        uint32 depositors; // participants with a deposit
        uint32 claims; // participants who have claimed
        uint128 tokens; // tokens received by the buy, measured
        uint40 boughtAt;
        uint40 holdUntil;
        Checkpoint prev;
        Checkpoint last;
        uint128 gross; // MON the sale returned, measured
        uint128 payout; // gross - keeper reward - fee: shared pro rata, caller included
        uint128 fee; // caller's profit share
        uint128 claimed; // MON (or tokens, after a split) claimed so far, fee excluded
        int256 netReturnBps; // payout / totalIn - 1, what goes on the record
        string thesis;
    }

    struct Record {
        uint32 settled;
        uint32 losses; // settled with a negative net return
        uint32 negligent; // refunded because the caller never bought
        uint32 refunded; // refunded with no fault (pool below minimum, token delisted)
        uint32 split;
        uint32 slashes;
        uint32 active; // calls Open or Holding
        uint64 lastActive;
        int256 sumNetBps; // over settled calls
    }

    struct Bond {
        uint256 amount;
        uint64 withdrawReadyAt; // 0 when no withdrawal is pending
    }

    struct Params {
        uint128 minBond;
        uint128 minPool;
        uint32 minWindow;
        uint32 maxWindow;
        uint32 buyGrace; // buy deadline = window end + this
        uint32 minHold;
        uint32 maxHold;
        uint32 checkpointGap;
        uint32 splitGrace;
        uint32 bondCooldown;
        uint16 minStopLossBps;
        uint16 maxStopLossBps;
        uint16 minCallerBps;
        uint16 maxImpactBps;
        uint16 sellToleranceBps;
        uint16 keeperBps;
    }

    // ---------------------------------------------------------------- constants

    uint256 internal constant BPS = 10_000;
    uint256 public constant MAX_THESIS = 280;
    uint256 public constant MAX_TAKE_PROFIT_BPS = 1_000_000; // 100x
    uint256 public constant MAX_KEEPER_BPS = 100;
    /// @dev Impact is measured against the price this amount gets. Small enough to be the spot price.
    uint256 public constant PROBE = 0.001 ether;

    // ---------------------------------------------------------------- params
    // Production defaults from docs/product.md. Admin-settable, for later calls only.

    Params internal _params = Params({
        minBond: 10 ether,
        minPool: 50 ether,
        minWindow: 30 minutes,
        maxWindow: 6 hours,
        buyGrace: 2 hours,
        minHold: 1 hours,
        maxHold: 72 hours,
        checkpointGap: 15 minutes,
        splitGrace: 6 hours,
        bondCooldown: 7 days,
        minStopLossBps: 100,
        maxStopLossBps: 9000,
        minCallerBps: 500,
        maxImpactBps: 200,
        sellToleranceBps: 200,
        keeperBps: 10
    });

    address public admin;
    address public pendingAdmin;
    address public treasury; // where slashed bond goes
    ISwapAdapter public adapter; // adapter for new calls
    bool public openPaused; // stops new calls only

    mapping(address => bool) public allowed;
    mapping(address => Bond) public bonds;
    mapping(address => Record) internal _records;
    mapping(address => uint256[]) internal _callsOf;
    mapping(uint256 => mapping(address => uint256)) public depositOf;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => mapping(address => bool)) internal _everDeposited;
    mapping(uint256 => address[]) internal _participants;
    Call[] internal _calls;

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events

    event BondPosted(address indexed caller, uint256 amount, uint256 total);
    event BondWithdrawRequested(address indexed caller, uint64 readyAt);
    event BondWithdrawn(address indexed caller, uint256 amount);
    event Slashed(address indexed caller, uint256 amount, string reason);
    event CallOpened(
        uint256 indexed id, address indexed caller, address indexed token, uint8 tier, Rules rules, string thesis
    );
    event Deposited(uint256 indexed id, address indexed account, uint256 amount, uint256 deposit, uint256 total);
    event Withdrawn(uint256 indexed id, address indexed account, uint256 amount, uint256 deposit, uint256 total);
    event Bought(uint256 indexed id, uint256 monIn, uint256 tokens, uint64 holdUntil);
    event Checkpointed(uint256 indexed id, uint256 value, uint64 at);
    /// @param reason 1 take-profit, 2 stop-loss, 3 max hold
    event Sold(
        uint256 indexed id,
        address indexed keeper,
        uint8 reason,
        uint256 gross,
        uint256 keeperReward,
        uint256 fee,
        uint256 payout,
        int256 netReturnBps
    );
    event Refunded(uint256 indexed id, bool negligent);
    event SplitStarted(uint256 indexed id, uint256 tokens);
    event Claimed(uint256 indexed id, address indexed account, uint256 mon, uint256 tokens);
    event TokenAllowed(address indexed token, bool allowed);
    event AdapterSet(address indexed adapter);
    event TreasurySet(address indexed treasury);
    event ParamsSet(Params params);
    event OpenPausedSet(bool paused);
    event AdminTransferStarted(address indexed from, address indexed to);
    event AdminTransferred(address indexed from, address indexed to);

    // ---------------------------------------------------------------- errors

    error NotAdmin();
    error NotPendingAdmin();
    error NotCaller();
    error CallerCannotWithdraw();
    error Reentrant();
    error ZeroAddress();
    error BondTooSmall();
    error NoBond();
    error TokenNotAllowed();
    error BadRules();
    error ShareAboveTier();
    error ThesisTooLong();
    error ZeroValue();
    error BadAmount();
    error EmptyReason();
    error OverCap();
    error ImpactTooHigh();
    error NoLiquidity();
    error CallerStakeTooSmall();
    error PoolTooSmall();
    error NothingBought();
    error Slippage();
    error UnknownCall();
    error WrongState();
    error TooEarly();
    error TooLate();
    error CheckpointTooSoon();
    error CheckpointStale();
    error ConditionNotMet();
    error CheckpointsDisagree();
    error NotParticipant();
    error AlreadyClaimed();
    error ActiveCalls();
    error NoWithdrawal();
    error OpenPaused();
    error BadParams();
    error Overflow();
    error TransferFailed();
    error DirectTransfer();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @dev On every state-changing entry point, not only the ones that call out: an allowed
    /// token or an adapter can call back during a swap, and must find every door shut.
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address admin_, address treasury_, ISwapAdapter adapter_) {
        if (admin_ == address(0) || treasury_ == address(0) || address(adapter_) == address(0)) revert ZeroAddress();
        admin = admin_;
        treasury = treasury_;
        adapter = adapter_;
        emit AdminTransferred(address(0), admin_);
        emit TreasurySet(treasury_);
        emit AdapterSet(address(adapter_));
    }

    /// @dev MON arrives only from an adapter paying out a sale, inside `sell`. Bonds and
    /// deposits go through their functions, so a stray transfer is never mistaken for either.
    receive() external payable {
        if (_lock != 2) revert DirectTransfer();
    }

    // ---------------------------------------------------------------- bond

    function postBond() external payable nonReentrant {
        if (msg.value == 0) revert ZeroValue();
        Bond storage b = bonds[msg.sender];
        b.amount += msg.value;
        b.withdrawReadyAt = 0; // adding to the bond cancels a pending withdrawal
        emit BondPosted(msg.sender, msg.value, b.amount);
    }

    function requestBondWithdraw() external nonReentrant {
        if (_records[msg.sender].active != 0) revert ActiveCalls();
        Bond storage b = bonds[msg.sender];
        if (b.amount == 0) revert NoBond();
        uint64 readyAt = uint64(block.timestamp) + _params.bondCooldown;
        b.withdrawReadyAt = readyAt;
        emit BondWithdrawRequested(msg.sender, readyAt);
    }

    function withdrawBond() external nonReentrant {
        Bond storage b = bonds[msg.sender];
        if (b.withdrawReadyAt == 0) revert NoWithdrawal();
        if (block.timestamp < b.withdrawReadyAt) revert TooEarly();
        if (_records[msg.sender].active != 0) revert ActiveCalls();
        uint256 amount = b.amount;
        b.amount = 0;
        b.withdrawReadyAt = 0;
        _sendMon(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- open

    /// @notice Opens a call with the attached MON as the caller's own first deposit. Every rule
    /// is fixed from this moment on.
    /// @param window seconds the pool takes deposits
    /// @param takeProfitBps sell once the position is worth this much above entry; 0 = none
    /// @param stopLossBps sell once the position is worth this much below entry
    /// @param maxHold seconds after the buy when anyone may sell regardless of price
    /// @param shareBps caller's share of profit, at most the caller's tier allows
    function openCall(
        address token,
        uint32 window,
        uint32 takeProfitBps,
        uint16 stopLossBps,
        uint32 maxHold,
        uint16 shareBps,
        string calldata thesis
    ) external payable nonReentrant returns (uint256 id) {
        Params memory p = _params;
        if (openPaused) revert OpenPaused();
        if (msg.value == 0) revert ZeroValue();
        uint256 bond = bonds[msg.sender].amount;
        if (bond < p.minBond || bond == 0) revert BondTooSmall();
        if (!allowed[token]) revert TokenNotAllowed();
        if (
            window < p.minWindow || window > p.maxWindow || maxHold < p.minHold || maxHold > p.maxHold
                || stopLossBps < p.minStopLossBps || stopLossBps > p.maxStopLossBps
                || takeProfitBps > MAX_TAKE_PROFIT_BPS
        ) revert BadRules();
        if (bytes(thesis).length > MAX_THESIS) revert ThesisTooLong();
        uint8 tier = tierOf(msg.sender);
        (uint256 multiple, uint256 maxShare) = _tier(tier);
        if (shareBps > maxShare) revert ShareAboveTier();

        id = _calls.length;
        Call storage c = _calls.push();
        c.caller = msg.sender;
        c.openedAt = uint40(block.timestamp);
        c.state = State.Open;
        c.token = token;
        c.thesis = thesis;
        Rules storage r = c.rules;
        r.adapter = adapter;
        r.windowEnd = _u40(block.timestamp + window);
        r.buyDeadline = _u40(uint256(r.windowEnd) + p.buyGrace);
        r.maxHold = maxHold;
        r.takeProfitBps = takeProfitBps;
        r.stopLossBps = stopLossBps;
        r.shareBps = shareBps;
        r.minCallerBps = p.minCallerBps;
        r.maxImpactBps = p.maxImpactBps;
        r.sellToleranceBps = p.sellToleranceBps;
        r.keeperBps = p.keeperBps;
        r.checkpointGap = p.checkpointGap;
        r.splitGrace = p.splitGrace;
        r.cap = _u128(bond * multiple);
        r.minPool = p.minPool;
        _callsOf[msg.sender].push(id);

        Record storage rec = _records[msg.sender];
        rec.active += 1;
        rec.lastActive = uint64(block.timestamp);
        bonds[msg.sender].withdrawReadyAt = 0; // a bond behind an active call cannot be leaving

        emit CallOpened(id, msg.sender, token, tier, c.rules, thesis);
        _deposit(id, c, msg.sender, msg.value);
    }

    // ---------------------------------------------------------------- deposits

    /// @notice Adds the attached MON to the pool while its window is open.
    function deposit(uint256 id) external payable nonReentrant {
        if (msg.value == 0) revert ZeroValue();
        Call storage c = _callOf(id);
        if (c.state != State.Open || block.timestamp >= c.rules.windowEnd) revert WrongState();
        _deposit(id, c, msg.sender, msg.value);
    }

    /// @notice Takes `amount` back out, 1:1, while the window is open. The caller cannot leave.
    function withdraw(uint256 id, uint256 amount) external nonReentrant {
        Call storage c = _callOf(id);
        if (c.state != State.Open || block.timestamp >= c.rules.windowEnd) revert WrongState();
        if (msg.sender == c.caller) revert CallerCannotWithdraw();
        uint256 d = depositOf[id][msg.sender];
        if (amount == 0 || amount > d) revert BadAmount();
        d -= amount;
        depositOf[id][msg.sender] = d;
        c.totalIn -= uint128(amount);
        if (d == 0) c.depositors -= 1;
        _sendMon(msg.sender, amount);
        emit Withdrawn(id, msg.sender, amount, d, c.totalIn);
    }

    function _deposit(uint256 id, Call storage c, address account, uint256 amount) internal {
        uint256 total = c.totalIn + amount;
        if (total > c.rules.cap) revert OverCap();
        if (impactBps(c.rules.adapter, c.token, total) > c.rules.maxImpactBps) revert ImpactTooHigh();
        uint256 d = depositOf[id][account];
        if (d == 0) {
            c.depositors += 1;
            if (!_everDeposited[id][account]) {
                _everDeposited[id][account] = true;
                _participants[id].push(account);
            }
        }
        d += amount;
        depositOf[id][account] = d;
        c.totalIn = _u128(total);
        // A joiner can never push the caller below their minimum stake: the caller cannot top up
        // after the window, so otherwise one late deposit could make the buy impossible.
        if (depositOf[id][c.caller] * BPS < uint256(c.rules.minCallerBps) * total) revert CallerStakeTooSmall();
        emit Deposited(id, account, amount, d, total);
    }

    // ---------------------------------------------------------------- buy

    /// @notice The caller buys for the whole pool, once the window has closed and before the
    /// buy deadline. If any check fails nothing moves and the caller may retry until the deadline.
    /// @param minTokens least tokens that must arrive, after any transfer fee. A guard the caller
    /// adds against a price moved just before the buy; the impact check applies on top.
    function buy(uint256 id, uint256 minTokens) external nonReentrant {
        Call storage c = _callOf(id);
        Rules memory r = c.rules;
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Open) revert WrongState();
        if (block.timestamp < r.windowEnd) revert TooEarly();
        if (block.timestamp >= r.buyDeadline) revert TooLate();
        if (!allowed[c.token]) revert TokenNotAllowed();
        uint256 total = c.totalIn;
        if (total < r.minPool) revert PoolTooSmall();
        if (total > r.cap) revert OverCap();
        if (depositOf[id][c.caller] * BPS < uint256(r.minCallerBps) * total) revert CallerStakeTooSmall();
        if (impactBps(r.adapter, c.token, total) > r.maxImpactBps) revert ImpactTooHigh();

        uint256 before = IERC20Min(c.token).balanceOf(address(this));
        r.adapter.buy{value: total}(c.token, minTokens, address(this));
        uint256 received = IERC20Min(c.token).balanceOf(address(this)) - before;
        if (received == 0) revert NothingBought();
        if (received < minTokens) revert Slippage();

        c.state = State.Holding;
        c.tokens = _u128(received);
        c.boughtAt = uint40(block.timestamp);
        c.holdUntil = _u40(block.timestamp + r.maxHold);
        _records[c.caller].lastActive = uint64(block.timestamp);
        emit Bought(id, total, received, c.holdUntil);
    }

    // ---------------------------------------------------------------- sale

    /// @notice Records what the whole position would sell for now. Anyone, while holding, at
    /// most once per checkpoint gap.
    function checkpoint(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        if (c.state != State.Holding) revert WrongState();
        if (c.last.at != 0 && block.timestamp < uint256(c.last.at) + c.rules.checkpointGap) {
            revert CheckpointTooSoon();
        }
        uint256 value = c.rules.adapter.quoteSell(c.token, c.tokens);
        c.prev = c.last;
        c.last = Checkpoint(_u128(value), uint40(block.timestamp));
        emit Checkpointed(id, value, uint64(block.timestamp));
    }

    /// @notice Sells the whole position. Anyone may, when the last two checkpoints both meet
    /// take-profit or both meet stop-loss, or once max hold has passed and the last two
    /// checkpoints agree within the sale tolerance. The latest checkpoint must be at most one
    /// gap old. The least MON the sale must return is computed here from
    /// the checkpoints, never passed in. The keeper is paid a small share of gross proceeds.
    function sell(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        Rules memory r = c.rules;
        if (c.state != State.Holding) revert WrongState();
        Checkpoint memory last = c.last;
        if (last.at == 0 || block.timestamp > uint256(last.at) + r.checkpointGap) revert CheckpointStale();

        Checkpoint memory prev = c.prev;
        if (prev.at == 0) revert ConditionNotMet(); // two checkpoints, a gap apart, on every path
        uint8 reason;
        if (block.timestamp >= c.holdUntil) {
            // Max hold has no price rule for both checkpoints to meet, so they must agree with each
            // other instead: one checkpoint taken on a dumped price cannot set the floor.
            uint256 hi = prev.value > last.value ? prev.value : last.value;
            uint256 lo = prev.value < last.value ? prev.value : last.value;
            if (lo * BPS < hi * (BPS - r.sellToleranceBps)) revert CheckpointsDisagree();
            reason = 3;
        } else {
            uint256 base = uint256(c.totalIn) * BPS;
            if (
                r.takeProfitBps != 0 && uint256(prev.value) * BPS >= base + uint256(c.totalIn) * r.takeProfitBps
                    && uint256(last.value) * BPS >= base + uint256(c.totalIn) * r.takeProfitBps
            ) {
                reason = 1;
            } else if (
                uint256(prev.value) * BPS <= base - uint256(c.totalIn) * r.stopLossBps
                    && uint256(last.value) * BPS <= base - uint256(c.totalIn) * r.stopLossBps
            ) {
                reason = 2;
            } else {
                revert ConditionNotMet();
            }
        }
        uint256 floor = prev.value < last.value ? prev.value : last.value;
        uint256 minOut = (floor * (BPS - r.sellToleranceBps)) / BPS;

        c.state = State.Settled;
        uint256 before = address(this).balance;
        _sendToken(c.token, address(r.adapter), c.tokens);
        r.adapter.sell(c.token, c.tokens, minOut, address(this));
        uint256 gross = address(this).balance - before;
        if (gross < minOut) revert Slippage();

        uint256 reward = (gross * r.keeperBps) / BPS;
        uint256 net = gross - reward;
        uint256 totalIn = c.totalIn;
        uint256 fee = net > totalIn ? ((net - totalIn) * r.shareBps) / BPS : 0;
        uint256 payout = net - fee;
        int256 ret = ((int256(payout) - int256(totalIn)) * int256(BPS)) / int256(totalIn);
        c.gross = _u128(gross);
        c.fee = _u128(fee);
        c.payout = _u128(payout);
        c.netReturnBps = ret;

        Record storage rec = _records[c.caller];
        rec.active -= 1;
        rec.settled += 1;
        if (ret < 0) rec.losses += 1;
        rec.sumNetBps += ret;
        rec.lastActive = uint64(block.timestamp);

        if (reward != 0) _sendMon(msg.sender, reward);
        emit Sold(id, msg.sender, reason, gross, reward, fee, payout, ret);
    }

    // ---------------------------------------------------------------- safety nets

    /// @notice Ends a call that was never bought, so every deposit can be claimed back 1:1.
    /// Anyone may, once the window has closed with the pool below its minimum (no fault), or
    /// once the buy deadline has passed (the caller is recorded negligent, unless the token was
    /// delisted, which is not the caller's doing).
    function refund(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        if (c.state != State.Open) revert WrongState();
        bool small = c.totalIn < c.rules.minPool;
        if (block.timestamp < (small ? c.rules.windowEnd : c.rules.buyDeadline)) revert TooEarly();
        bool negligent = !small && allowed[c.token];

        c.state = State.Refunded;
        Record storage rec = _records[c.caller];
        rec.active -= 1;
        if (negligent) rec.negligent += 1;
        else rec.refunded += 1;
        emit Refunded(id, negligent);
    }

    /// @notice For a position nobody could sell: once max hold plus the split grace has passed
    /// and the call still holds, anyone may end it so each participant claims tokens pro rata.
    /// No fee. Recorded as a split, not as a result.
    function split(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        if (c.state != State.Holding) revert WrongState();
        if (block.timestamp < uint256(c.holdUntil) + c.rules.splitGrace) revert TooEarly();
        c.state = State.Split;
        Record storage rec = _records[c.caller];
        rec.active -= 1;
        rec.split += 1;
        rec.lastActive = uint64(block.timestamp);
        emit SplitStarted(id, c.tokens);
    }

    // ---------------------------------------------------------------- claims

    /// @notice Pays out a participant's part, once: MON pro rata after a sale (plus the fee to
    /// the caller), the deposit 1:1 after a refund, tokens pro rata after a split. The last
    /// participant to claim takes what is left, so no remainder is ever stranded.
    function claim(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        State s = c.state;
        if (s != State.Settled && s != State.Refunded && s != State.Split) revert WrongState();
        uint256 d = depositOf[id][msg.sender];
        if (d == 0) revert NotParticipant();
        if (hasClaimed[id][msg.sender]) revert AlreadyClaimed();
        hasClaimed[id][msg.sender] = true;
        c.claims += 1;
        bool lastOne = c.claims == c.depositors;

        if (s == State.Refunded) {
            c.claimed += uint128(d);
            _sendMon(msg.sender, d);
            emit Claimed(id, msg.sender, d, 0);
            return;
        }
        uint256 pot = s == State.Settled ? c.payout : c.tokens;
        uint256 part = lastOne ? pot - c.claimed : FullMath.mulDiv(pot, d, c.totalIn);
        c.claimed += uint128(part);
        if (s == State.Settled) {
            uint256 mon = part;
            if (msg.sender == c.caller) mon += c.fee;
            _sendMon(msg.sender, mon);
            emit Claimed(id, msg.sender, mon, 0);
        } else {
            _sendToken(c.token, msg.sender, part);
            emit Claimed(id, msg.sender, 0, part);
        }
    }

    // ---------------------------------------------------------------- admin
    // The admin manages the token list, parameters for later calls and slashing. It has no
    // path to MON or tokens held for a call: every rule and the adapter are fixed at open.

    function setAllowed(address token, bool ok) external onlyAdmin {
        if (token == address(0)) revert ZeroAddress();
        allowed[token] = ok;
        emit TokenAllowed(token, ok);
    }

    function setAdapter(ISwapAdapter a) external onlyAdmin {
        if (address(a) == address(0)) revert ZeroAddress();
        adapter = a;
        emit AdapterSet(address(a));
    }

    function setTreasury(address t) external onlyAdmin {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasurySet(t);
    }

    function setParams(Params calldata p) external onlyAdmin {
        if (
            p.minWindow == 0 || p.minWindow > p.maxWindow || p.buyGrace == 0 || p.minHold == 0 || p.minHold > p.maxHold
                || p.checkpointGap == 0 || p.splitGrace == 0 || p.minStopLossBps == 0
                || p.minStopLossBps > p.maxStopLossBps || p.maxStopLossBps >= BPS || p.minCallerBps == 0
                || p.minCallerBps > BPS || p.maxImpactBps == 0 || p.maxImpactBps >= BPS || p.sellToleranceBps >= BPS
                || p.keeperBps > MAX_KEEPER_BPS
        ) revert BadParams();
        _params = p;
        emit ParamsSet(p);
    }

    function setOpenPaused(bool paused) external onlyAdmin {
        openPaused = paused;
        emit OpenPausedSet(paused);
    }

    /// @notice First step of a two-step handover; the new admin must accept.
    /// Passing address(0) cancels a pending handover.
    function transferAdmin(address to) external onlyAdmin {
        pendingAdmin = to;
        emit AdminTransferStarted(admin, to);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        emit AdminTransferred(admin, msg.sender);
        admin = msg.sender;
        pendingAdmin = address(0);
    }

    /// @notice Takes up to `amount` of a caller's bond to the treasury. The reason is public.
    /// A slashed caller drops to tier 0 for good.
    function slash(address caller, uint256 amount, string calldata reason) external onlyAdmin nonReentrant {
        if (bytes(reason).length == 0) revert EmptyReason();
        Bond storage b = bonds[caller];
        if (amount > b.amount) amount = b.amount;
        if (amount == 0) revert ZeroValue();
        b.amount -= amount;
        _records[caller].slashes += 1;
        _sendMon(treasury, amount);
        emit Slashed(caller, amount, reason);
    }

    // ---------------------------------------------------------------- views

    function callCount() external view returns (uint256) {
        return _calls.length;
    }

    function getCall(uint256 id) external view returns (Call memory) {
        return _callOf(id);
    }

    function callsOf(address caller) external view returns (uint256[] memory) {
        return _callsOf[caller];
    }

    /// @notice Everyone who ever deposited into a call, including anyone who withdrew to zero.
    function participantsOf(uint256 id) external view returns (address[] memory) {
        return _participants[id];
    }

    function recordOf(address caller) external view returns (Record memory) {
        return _records[caller];
    }

    function params() external view returns (Params memory) {
        return _params;
    }

    /// @notice 0 with fewer than 3 settled calls, a non-positive average or any slash; then
    /// 1, 2, 3 at 3, 10, 25 settled calls with a positive average net return.
    function tierOf(address caller) public view returns (uint8) {
        Record storage r = _records[caller];
        if (r.slashes != 0 || r.settled < 3 || r.sumNetBps <= 0) return 0;
        if (r.settled >= 25) return 3;
        if (r.settled >= 10) return 2;
        return 1;
    }

    /// @return multiple pool cap as a multiple of bond
    /// @return maxShareBps largest profit share the tier may set
    function tierLimits(uint8 tier) external pure returns (uint256 multiple, uint256 maxShareBps) {
        return _tier(tier);
    }

    /// @notice Price impact of buying with `monIn`, in bps: how much worse its average price is
    /// than the price a tiny probe gets. The same measure the contract enforces.
    function impactBps(ISwapAdapter a, address token, uint256 monIn) public view returns (uint256) {
        uint256 probeOut = a.quoteBuy(token, PROBE);
        if (probeOut == 0) revert NoLiquidity();
        if (monIn <= PROBE) return 0;
        uint256 out = a.quoteBuy(token, monIn);
        // out/monIn against probeOut/PROBE, without losing precision
        uint256 ratio = FullMath.mulDiv(out, PROBE * BPS, probeOut * monIn);
        return ratio >= BPS ? 0 : BPS - ratio;
    }

    /// @notice The most this call's pool can hold right now: the lower of its bond cap and the
    /// largest total whose buy stays within the impact limit. What the UI shows as the cap.
    function capOf(uint256 id) external view returns (uint256) {
        Call storage c = _callOf(id);
        uint256 hi = c.rules.cap;
        ISwapAdapter a = c.rules.adapter;
        if (impactBps(a, c.token, hi) <= c.rules.maxImpactBps) return hi;
        uint256 lo = 0;
        // impact grows with size; 64 halvings get to within a wei of the limit
        for (uint256 i; i < 64 && lo + 1 < hi; ++i) {
            uint256 mid = (lo + hi) / 2;
            if (impactBps(a, c.token, mid) <= c.rules.maxImpactBps) lo = mid;
            else hi = mid;
        }
        return lo;
    }

    // ---------------------------------------------------------------- internal

    function _tier(uint8 tier) internal pure returns (uint256 multiple, uint256 maxShareBps) {
        if (tier == 0) return (2, 500);
        if (tier == 1) return (5, 1000);
        if (tier == 2) return (10, 1500);
        return (20, 2000);
    }

    function _callOf(uint256 id) internal view returns (Call storage) {
        if (id >= _calls.length) revert UnknownCall();
        return _calls[id];
    }

    function _u40(uint256 x) internal pure returns (uint40) {
        if (x > type(uint40).max) revert Overflow();
        return uint40(x);
    }

    function _u128(uint256 x) internal pure returns (uint128) {
        if (x > type(uint128).max) revert Overflow();
        return uint128(x);
    }

    function _sendMon(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _sendToken(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20Min.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
