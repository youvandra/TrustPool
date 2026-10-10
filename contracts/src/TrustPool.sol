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
contract TrustPool {
    enum State {
        None,
        Locked, // position held, no exit announced
        Exiting, // exit announced, executable from `exitAt`
        Settled, // sold through the adapter; return recorded from the real fill
        Released // tokens handed to the caller unsold; recorded as a total loss
    }

    struct Call {
        address caller;
        address token;
        uint96 monIn; // MON spent on entry
        uint256 tokens; // tokens actually received (fee-on-transfer safe)
        uint64 openedAt;
        uint64 unlockAt; // earliest moment an exit can execute
        uint32 notice; // seconds between announcing and executing an exit
        uint64 announcedAt; // when the exit was announced
        uint64 exitAt; // earliest moment the announced exit can execute
        uint96 monOut; // set on settlement
        State state;
        string thesis; // short public note, fixed at open
    }

    struct Record {
        uint32 settled;
        uint32 losses; // settled below entry, plus every release
        uint32 released;
        uint32 open;
        uint32 slashes;
        int256 sumReturnBps; // over settled and released calls
        uint64 lastActive;
    }

    struct Bond {
        uint256 amount;
        uint64 withdrawReadyAt; // 0 when no withdrawal is pending
    }

    // ---------------------------------------------------------------- params
    // Defaults live in docs/product.md. All are admin-settable; none touch an open call.

    uint256 public minBond = 10 ether;
    uint64 public minLock = 1 days;
    uint64 public maxLock = 30 days;
    uint32 public minNotice = 6 hours;
    uint64 public bondCooldown = 7 days;
    uint64 public releaseGrace = 6 hours;
    uint256 public constant MAX_THESIS = 280;

    address public admin;
    address public treasury; // where slashed bond goes
    ISwapAdapter public adapter;

    mapping(address => bool) public allowed;
    mapping(address => Bond) public bonds;
    mapping(address => Record) public records;
    mapping(address => uint256[]) internal _callsOf;
    Call[] internal _calls;

    uint256 private _lock = 1;

    // ---------------------------------------------------------------- events

    event BondPosted(address indexed caller, uint256 amount, uint256 total);
    event BondWithdrawRequested(address indexed caller, uint64 readyAt);
    event BondWithdrawn(address indexed caller, uint256 amount);
    event Slashed(address indexed caller, uint256 amount, string reason);
    event CallOpened(
        uint256 indexed id, address indexed caller, address indexed token, uint256 monIn, uint256 tokens, uint64 unlockAt, uint32 notice
    );
    event ExitAnnounced(uint256 indexed id, address indexed caller, uint64 exitAt);
    event CallSettled(uint256 indexed id, address indexed caller, uint256 monIn, uint256 monOut, int256 returnBps);
    event CallReleased(uint256 indexed id, address indexed caller, uint256 tokens);
    event TokenAllowed(address indexed token, bool allowed);
    event AdapterSet(address adapter);

    // ---------------------------------------------------------------- errors

    error NotAdmin();
    error NotCaller();
    error Reentrant();
    error BondTooSmall();
    error TokenNotAllowed();
    error LockOutOfRange();
    error NoticeTooShort();
    error ThesisTooLong();
    error ZeroValue();
    error NothingBought();
    error WrongState();
    error TooEarly();
    error OpenCalls();
    error NoWithdrawal();
    error TransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrant();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address admin_, address treasury_, ISwapAdapter adapter_) {
        admin = admin_;
        treasury = treasury_;
        adapter = adapter_;
    }

    // ---------------------------------------------------------------- bond

    function postBond() external payable {
        if (msg.value == 0) revert ZeroValue();
        Bond storage b = bonds[msg.sender];
        b.amount += msg.value;
        b.withdrawReadyAt = 0; // adding to the bond cancels a pending withdrawal
        emit BondPosted(msg.sender, msg.value, b.amount);
    }

    function requestBondWithdraw() external {
        if (records[msg.sender].open != 0) revert OpenCalls();
        uint64 readyAt = uint64(block.timestamp) + bondCooldown;
        bonds[msg.sender].withdrawReadyAt = readyAt;
        emit BondWithdrawRequested(msg.sender, readyAt);
    }

    function withdrawBond() external nonReentrant {
        Bond storage b = bonds[msg.sender];
        if (b.withdrawReadyAt == 0) revert NoWithdrawal();
        if (block.timestamp < b.withdrawReadyAt) revert TooEarly();
        if (records[msg.sender].open != 0) revert OpenCalls();
        uint256 amount = b.amount;
        b.amount = 0;
        b.withdrawReadyAt = 0;
        _sendMon(msg.sender, amount);
        emit BondWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- calls

    /// @notice Opens a call: buys `token` with the attached MON and locks it here.
    /// Token, lock, notice and thesis are fixed from this moment on.
    function openCall(address token, uint64 lockSeconds, uint32 notice, uint256 minOut, string calldata thesis)
        external
        payable
        nonReentrant
        returns (uint256 id)
    {
        if (msg.value == 0) revert ZeroValue();
        if (bonds[msg.sender].amount < minBond) revert BondTooSmall();
        if (!allowed[token]) revert TokenNotAllowed();
        if (lockSeconds < minLock || lockSeconds > maxLock) revert LockOutOfRange();
        if (notice < minNotice) revert NoticeTooShort();
        if (bytes(thesis).length > MAX_THESIS) revert ThesisTooLong();

        uint256 before = IERC20Min(token).balanceOf(address(this));
        adapter.buy{value: msg.value}(token, minOut, address(this));
        uint256 received = IERC20Min(token).balanceOf(address(this)) - before;
        if (received == 0) revert NothingBought();

        id = _calls.length;
        _calls.push(
            Call({
                caller: msg.sender,
                token: token,
                monIn: uint96(msg.value),
                tokens: received,
                openedAt: uint64(block.timestamp),
                unlockAt: uint64(block.timestamp) + lockSeconds,
                notice: notice,
                announcedAt: 0,
                exitAt: 0,
                monOut: 0,
                state: State.Locked,
                thesis: thesis
            })
        );
        _callsOf[msg.sender].push(id);

        Record storage r = records[msg.sender];
        r.open += 1;
        r.lastActive = uint64(block.timestamp);
        bonds[msg.sender].withdrawReadyAt = 0;

        emit CallOpened(id, msg.sender, token, msg.value, received, uint64(block.timestamp) + lockSeconds, notice);
    }

    /// @notice Publishes the caller's intent to exit. The exit executes no earlier than
    /// `notice` seconds from now, and never before the lock ends.
    function announceExit(uint256 id) external {
        Call storage c = _calls[id];
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Locked) revert WrongState();
        uint64 afterNotice = uint64(block.timestamp) + c.notice;
        c.announcedAt = uint64(block.timestamp);
        c.exitAt = afterNotice > c.unlockAt ? afterNotice : c.unlockAt;
        c.state = State.Exiting;
        emit ExitAnnounced(id, msg.sender, c.exitAt);
    }

    /// @notice Sells the whole position through the adapter and pays the caller.
    /// The return in the record comes from this fill.
    function executeExit(uint256 id, uint256 minOut) external nonReentrant {
        Call storage c = _calls[id];
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Exiting) revert WrongState();
        if (block.timestamp < c.exitAt) revert TooEarly();

        c.state = State.Settled;
        _sendToken(c.token, address(adapter), c.tokens);
        uint256 monOut = adapter.sell(c.token, c.tokens, minOut, c.caller);
        c.monOut = uint96(monOut);

        int256 ret = ((int256(monOut) - int256(uint256(c.monIn))) * 10_000) / int256(uint256(c.monIn));
        Record storage r = records[c.caller];
        r.open -= 1;
        r.settled += 1;
        if (ret < 0) r.losses += 1;
        r.sumReturnBps += ret;
        r.lastActive = uint64(block.timestamp);

        emit CallSettled(id, c.caller, c.monIn, monOut, ret);
    }

    /// @notice Escape hatch for a token that can no longer be sold. After the exit time plus
    /// a grace period the caller takes the tokens unsold. The record counts this as -100%,
    /// so the hatch can never hide a losing call.
    function releaseTokens(uint256 id) external nonReentrant {
        Call storage c = _calls[id];
        if (msg.sender != c.caller) revert NotCaller();
        if (c.state != State.Exiting) revert WrongState();
        if (block.timestamp < uint256(c.exitAt) + releaseGrace) revert TooEarly();

        c.state = State.Released;
        Record storage r = records[c.caller];
        r.open -= 1;
        r.released += 1;
        r.losses += 1;
        r.sumReturnBps -= 10_000;
        r.lastActive = uint64(block.timestamp);

        _sendToken(c.token, c.caller, c.tokens);
        emit CallReleased(id, c.caller, c.tokens);
    }

    // ---------------------------------------------------------------- admin
    // The admin manages the token list and slashes bonds. It has no path to a call's tokens.

    function setAllowed(address token, bool ok) external onlyAdmin {
        allowed[token] = ok;
        emit TokenAllowed(token, ok);
    }

    function setAdapter(ISwapAdapter a) external onlyAdmin {
        adapter = a;
        emit AdapterSet(address(a));
    }

    function setParams(uint256 minBond_, uint64 minLock_, uint64 maxLock_, uint32 minNotice_, uint64 bondCooldown_, uint64 releaseGrace_)
        external
        onlyAdmin
    {
        minBond = minBond_;
        minLock = minLock_;
        maxLock = maxLock_;
        minNotice = minNotice_;
        bondCooldown = bondCooldown_;
        releaseGrace = releaseGrace_;
    }

    function setAdmin(address a) external onlyAdmin {
        admin = a;
    }

    function slash(address caller, uint256 amount, string calldata reason) external onlyAdmin nonReentrant {
        Bond storage b = bonds[caller];
        if (amount > b.amount) amount = b.amount;
        b.amount -= amount;
        records[caller].slashes += 1;
        _sendMon(treasury, amount);
        emit Slashed(caller, amount, reason);
    }

    // ---------------------------------------------------------------- views

    function callCount() external view returns (uint256) {
        return _calls.length;
    }

    function getCall(uint256 id) external view returns (Call memory) {
        return _calls[id];
    }

    function callsOf(address caller) external view returns (uint256[] memory) {
        return _callsOf[caller];
    }

    // ---------------------------------------------------------------- internal

    function _sendMon(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _sendToken(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20Min.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
