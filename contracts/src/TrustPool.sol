// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";

interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// @title TrustPool
/// @notice A caller opens a call by buying a token through this contract. The position is
/// locked: the caller cannot sell before `unlockAt`, and every exit is announced publicly
/// `notice` seconds before it can execute. Followers buy on their own; the contract holds
/// only the caller's money. Every call ends in the caller's permanent record, losses included.
/// @dev Every rule that governs a call (lock, notice, adapter, release grace, max hold) is
/// copied into the call when it opens. Admin changes apply to later calls only, so the admin
/// has no path to a locked position: it cannot redirect the sale, delay the release hatch or
/// shorten the hold before a call counts as stale.
contract TrustPool {
    enum State {
        None,
        Locked, // position held, no exit announced
        Exiting, // exit announced, executable from `exitAt`
        Settled, // sold through the adapter; return recorded from the real fill
        Released // tokens handed to the caller unsold; recorded as a total loss
    }

    /// @dev Five fixed slots. Opening a call writes the first four; announcing rewrites slot 2
    /// and the state, settling adds slot 4. Times are uint40 (good until the year 36812) and
    /// every narrowing cast is checked, so an admin setting cannot make a value wrap.
    struct Call {
        // slot 0
        address caller;
        uint40 openedAt;
        uint32 notice; // seconds between announcing and executing an exit
        // slot 1
        address token;
        uint40 unlockAt; // earliest moment an exit can execute
        State state;
        bool stale; // left open past its max hold; permanent once set
        uint32 releaseGrace; // seconds after `exitAt` before the tokens can be released unsold
        // slot 2
        ISwapAdapter adapter; // DEX this call sells through; only the caller can move it
        uint40 announcedAt; // when the exit was announced
        uint40 exitAt; // earliest moment the announced exit can execute
        // slot 3
        uint96 monIn; // MON spent on entry (79 billion MON fits)
        uint32 maxHold; // seconds after `unlockAt` (or `exitAt`) before anyone can mark the call stale
        uint128 tokens; // tokens actually received (fee-on-transfer safe)
        // slot 4, written on settlement
        uint128 monOut; // MON received on settlement, measured by this contract
        string thesis; // short public note, fixed at open
    }

    struct Record {
        uint32 settled;
        uint32 losses; // settled below entry, plus every release
        uint32 released;
        uint32 open;
        uint32 slashes;
        uint32 stale; // calls left open past their max hold
        uint64 lastActive;
        int256 sumReturnBps; // over settled and released calls
    }

    struct Bond {
        uint256 amount;
        uint64 withdrawReadyAt; // 0 when no withdrawal is pending
    }

    struct Params {
        uint256 minBond;
        uint64 minLock;
        uint64 maxLock;
        uint32 minNotice;
        uint64 bondCooldown;
        uint32 releaseGrace;
        uint32 maxHold;
    }

    // ---------------------------------------------------------------- params
    // Defaults live in docs/product.md. All are admin-settable and apply to later calls only.

    uint256 public constant MAX_THESIS = 280;
    int256 internal constant BPS = 10_000;

    uint256 public minBond = 10 ether;
    uint64 public minLock = 1 days;
    uint64 public maxLock = 30 days;
    uint32 public minNotice = 6 hours;
    uint64 public bondCooldown = 7 days;
    uint32 public releaseGrace = 6 hours;
    uint32 public maxHold = 30 days;

    address public admin;
    address public pendingAdmin;
    address public treasury; // where slashed bond goes
    ISwapAdapter public adapter; // adapter for new calls
    bool public openPaused; // stops new calls only; every open call can always exit

    mapping(address => bool) public allowed;
    mapping(address => Bond) public bonds;
    mapping(address => Record) internal _records;
    mapping(address => uint256[]) internal _callsOf;
    Call[] internal _calls;

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events

    event BondPosted(address indexed caller, uint256 amount, uint256 total);
    event BondWithdrawRequested(address indexed caller, uint64 readyAt);
    event BondWithdrawn(address indexed caller, uint256 amount);
    event Slashed(address indexed caller, uint256 amount, string reason);
    event CallOpened(
        uint256 indexed id,
        address indexed caller,
        address indexed token,
        uint256 monIn,
        uint256 tokens,
        uint64 unlockAt,
        uint32 notice,
        string thesis
    );
    event ExitAnnounced(uint256 indexed id, address indexed caller, uint64 exitAt);
    event CallSettled(uint256 indexed id, address indexed caller, uint256 monIn, uint256 monOut, int256 returnBps);
    event CallReleased(uint256 indexed id, address indexed caller, uint256 tokens);
    event CallMarkedStale(uint256 indexed id, address indexed caller);
    event CallAdapterMoved(uint256 indexed id, address adapter);
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
    error Reentrant();
    error ZeroAddress();
    error BondTooSmall();
    error NoBond();
    error TokenNotAllowed();
    error LockOutOfRange();
    error NoticeTooShort();
    error ThesisTooLong();
    error ZeroValue();
    error EmptyReason();
    error NothingBought();
    error Slippage();
    error UnknownCall();
    error WrongState();
    error TooEarly();
    error AlreadyStale();
    error OpenCalls();
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

    /// @dev MON arrives only from an adapter paying out a sale, inside `executeExit`.
    /// Bonds go through `postBond`, so a stray transfer can never be mistaken for one.
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
        if (_records[msg.sender].open != 0) revert OpenCalls();
        Bond storage b = bonds[msg.sender];
        if (b.amount == 0) revert NoBond();
        uint64 readyAt = uint64(block.timestamp) + bondCooldown;
        b.withdrawReadyAt = readyAt;
        emit BondWithdrawRequested(msg.sender, readyAt);
    }

    function withdrawBond() external nonReentrant {
        Bond storage b = bonds[msg.sender];
        if (b.withdrawReadyAt == 0) revert NoWithdrawal();
        if (block.timestamp < b.withdrawReadyAt) revert TooEarly();
        if (_records[msg.sender].open != 0) revert OpenCalls();
        uint256 amount = b.amount;
        b.amount = 0;
        b.withdrawReadyAt = 0;
        _sendMon(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- calls

    /// @notice Opens a call: buys `token` with the attached MON and locks it here.
    /// Token, lock, notice, thesis and the rules for leaving are fixed from this moment on.
    /// @param minOut least tokens that must arrive here, after any transfer fee.
    function openCall(address token, uint64 lockSeconds, uint32 notice, uint256 minOut, string calldata thesis)
        external
        payable
        nonReentrant
        returns (uint256 id)
    {
        if (openPaused) revert OpenPaused();
        if (msg.value == 0) revert ZeroValue();
        if (bonds[msg.sender].amount < minBond) revert BondTooSmall();
        if (!allowed[token]) revert TokenNotAllowed();
        if (lockSeconds < minLock || lockSeconds > maxLock) revert LockOutOfRange();
        if (notice < minNotice) revert NoticeTooShort();
        if (bytes(thesis).length > MAX_THESIS) revert ThesisTooLong();
        uint96 monIn = _u96(msg.value);

        ISwapAdapter a = adapter;
        uint256 before = IERC20Min(token).balanceOf(address(this));
        a.buy{value: msg.value}(token, minOut, address(this));
        uint256 received = IERC20Min(token).balanceOf(address(this)) - before;
        if (received == 0) revert NothingBought();
        if (received < minOut) revert Slippage();

        uint40 unlockAt = _u40(block.timestamp + lockSeconds);
        id = _calls.length;
        Call storage c = _calls.push();
        c.caller = msg.sender;
        c.openedAt = uint40(block.timestamp);
        c.notice = notice;
        c.token = token;
        c.unlockAt = unlockAt;
        c.state = State.Locked;
        c.adapter = a;
        c.releaseGrace = releaseGrace;
        c.maxHold = maxHold;
        c.monIn = monIn;
        c.tokens = _u128(received);
        c.thesis = thesis;
        _callsOf[msg.sender].push(id);

        Record storage r = _records[msg.sender];
        r.open += 1;
        r.lastActive = uint64(block.timestamp);
        bonds[msg.sender].withdrawReadyAt = 0; // a bond behind an open call cannot be leaving

        emit CallOpened(id, msg.sender, token, msg.value, received, unlockAt, notice, thesis);
    }

    /// @notice Publishes the caller's intent to exit. The exit executes no earlier than
    /// `notice` seconds from now, and never before the lock ends.
    function announceExit(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Locked) revert WrongState();
        uint40 afterNotice = _u40(block.timestamp + c.notice);
        c.announcedAt = uint40(block.timestamp);
        c.exitAt = afterNotice > c.unlockAt ? afterNotice : c.unlockAt;
        c.state = State.Exiting;
        emit ExitAnnounced(id, msg.sender, c.exitAt);
    }

    /// @notice Sells the whole position through the call's adapter and pays the caller.
    /// The return in the record comes from the MON this contract actually received.
    /// @param minOut least MON the sale must return; protects the caller, not the record.
    function executeExit(uint256 id, uint256 minOut) external nonReentrant {
        Call storage c = _callOf(id);
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Exiting) revert WrongState();
        if (block.timestamp < c.exitAt) revert TooEarly();

        c.state = State.Settled;
        ISwapAdapter a = c.adapter;
        uint256 before = address(this).balance;
        _sendToken(c.token, address(a), c.tokens);
        a.sell(c.token, c.tokens, minOut, address(this));
        uint256 monOut = address(this).balance - before;
        if (monOut < minOut) revert Slippage();
        c.monOut = _u128(monOut);

        int256 ret = ((int256(monOut) - int256(uint256(c.monIn))) * BPS) / int256(uint256(c.monIn));
        Record storage r = _records[c.caller];
        r.open -= 1;
        r.settled += 1;
        if (ret < 0) r.losses += 1;
        r.sumReturnBps += ret;
        r.lastActive = uint64(block.timestamp);

        _sendMon(c.caller, monOut);
        emit CallSettled(id, c.caller, c.monIn, monOut, ret);
    }

    /// @notice Escape hatch for a token that can no longer be sold. After the exit time plus
    /// the call's grace period the caller takes the tokens unsold. The record counts this as
    /// -100%, so the hatch can never hide a losing call.
    function releaseTokens(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Exiting) revert WrongState();
        if (block.timestamp < uint256(c.exitAt) + c.releaseGrace) revert TooEarly();

        c.state = State.Released;
        Record storage r = _records[c.caller];
        r.open -= 1;
        r.released += 1;
        r.losses += 1;
        r.sumReturnBps -= BPS;
        r.lastActive = uint64(block.timestamp);

        _sendToken(c.token, c.caller, c.tokens);
        emit CallReleased(id, c.caller, c.tokens);
    }

    /// @notice Marks a call that was left open too long. Anyone can call it once the call has
    /// sat locked for `maxHold` past its unlock, or unexecuted for `maxHold` past its exit time.
    /// Nothing is sold and no price is needed: the record simply counts the call as stale, for
    /// good. The caller can still exit it normally afterwards.
    function markStale(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        if (c.stale) revert AlreadyStale();
        uint256 from;
        if (c.state == State.Locked) from = c.unlockAt;
        else if (c.state == State.Exiting) from = c.exitAt;
        else revert WrongState();
        if (block.timestamp < from + c.maxHold) revert TooEarly();

        c.stale = true;
        _records[c.caller].stale += 1;
        emit CallMarkedStale(id, c.caller);
    }

    /// @notice Moves one of the caller's own calls to the current adapter, for when the DEX it
    /// opened on has lost its liquidity. Only the caller can do this; the admin never can.
    function moveToCurrentAdapter(uint256 id) external nonReentrant {
        Call storage c = _callOf(id);
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Locked && c.state != State.Exiting) revert WrongState();
        c.adapter = adapter;
        emit CallAdapterMoved(id, address(adapter));
    }

    // ---------------------------------------------------------------- admin
    // The admin manages the token list, new-call parameters and slashing. It has no path to a
    // call's tokens: the adapter, grace and max hold of a call are fixed when it opens.

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
        if (p.minLock == 0 || p.minLock > p.maxLock || p.minNotice == 0 || p.maxHold == 0) revert BadParams();
        minBond = p.minBond;
        minLock = p.minLock;
        maxLock = p.maxLock;
        minNotice = p.minNotice;
        bondCooldown = p.bondCooldown;
        releaseGrace = p.releaseGrace;
        maxHold = p.maxHold;
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

    function recordOf(address caller) external view returns (Record memory) {
        return _records[caller];
    }

    function params() external view returns (Params memory) {
        return Params(minBond, minLock, maxLock, minNotice, bondCooldown, releaseGrace, maxHold);
    }

    // ---------------------------------------------------------------- internal

    function _callOf(uint256 id) internal view returns (Call storage) {
        if (id >= _calls.length) revert UnknownCall();
        return _calls[id];
    }

    function _u40(uint256 x) internal pure returns (uint40) {
        if (x > type(uint40).max) revert Overflow();
        return uint40(x);
    }

    function _u96(uint256 x) internal pure returns (uint96) {
        if (x > type(uint96).max) revert Overflow();
        return uint96(x);
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
