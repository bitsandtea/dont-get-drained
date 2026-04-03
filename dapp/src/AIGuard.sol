// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/console.sol";

enum Operation {
    Call,
    DelegateCall
}

interface IGuard {
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address msgSender
    ) external;

    function checkAfterExecution(bytes32 txHash, bool success) external;
}

contract AIGuard is IGuard {
    // --- State ---

    address public immutable safe;        // the Safe this guard protects
    address public relayer;               // address allowed to submit approvals

    struct Approval {
        bool approved;
        bool consumed;
        bytes32 rootHash;  // 0G storage pointer to full AI reasoning
    }

    mapping(bytes32 => Approval) public approvals;
    mapping(bytes32 => bool) public usedRootHashes;
    bytes32 private _pendingTxHash;  // set in checkTransaction, consumed in checkAfterExecution

    // --- Events ---

    event TransactionApproved(bytes32 indexed txHash, bytes32 rootHash, bool execute);
    event TransactionBlocked(bytes32 indexed txHash);
    event TransactionConsumed(bytes32 indexed txHash);

    // --- Errors ---

    error NotRelayer();
    error NotApproved();
    error AlreadyConsumed();
    error MissingRootHash();
    error RootHashReused();

    // --- Constructor ---

    constructor(address _safe, address _relayer) {
        safe = _safe;
        relayer = _relayer;
    }

    // --- Relayer submits AI verdict ---

    function approveTransaction(
        bytes32 txHash,
        bytes32 rootHash,
        bool execute
    ) external {
        if (msg.sender != relayer) revert NotRelayer();

        // Every transaction must have its own unique inference
        if (rootHash == bytes32(0)) revert MissingRootHash();
        if (usedRootHashes[rootHash]) revert RootHashReused();
        usedRootHashes[rootHash] = true;

        approvals[txHash] = Approval({
            approved: execute,
            consumed: false,
            rootHash: rootHash
        });

        emit TransactionApproved(txHash, rootHash, execute);
    }

    // --- Safe Guard interface ---

    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory,       // signatures (unused)
        address             // msgSender (unused)
    ) external override {
        // Allow the Safe to call setGuard (so guard can be removed in emergency)
        if (to == safe && _isSetGuard(data)) return;

        bytes32 txHash = _hashTx(to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver);

        Approval storage approval = approvals[txHash];

        if (approval.consumed) revert AlreadyConsumed();
        if (approval.rootHash == bytes32(0)) revert MissingRootHash();
        if (!approval.approved) revert NotApproved();

        // Store for checkAfterExecution (Safe passes its own hash, not ours)
        _pendingTxHash = txHash;
    }

    function checkAfterExecution(bytes32, bool) external override {
        bytes32 txHash = _pendingTxHash;
        if (txHash != bytes32(0)) {
            approvals[txHash].consumed = true;
            _pendingTxHash = bytes32(0);
            emit TransactionConsumed(txHash);
        }
    }

    // --- View helpers ---

    function isApproved(bytes32 txHash) external view returns (bool) {
        return approvals[txHash].approved && !approvals[txHash].consumed;
    }

    function getRootHash(bytes32 txHash) external view returns (bytes32) {
        return approvals[txHash].rootHash;
    }

    // --- Internal helpers ---

    function _hashTx(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(to, value, keccak256(data), operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver));
    }

    function _isSetGuard(bytes memory data) internal pure returns (bool) {
        if (data.length < 4) return false;
        // setGuard(address) selector = 0xe19a9dd9
        return data[0] == 0xe1 && data[1] == 0x9a && data[2] == 0x9d && data[3] == 0xd9;
    }

    // ERC-165: Safe checks this to confirm it's a valid guard
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IGuard).interfaceId // 0x945b8148
            || interfaceId == 0x01ffc9a7; // ERC-165
    }
}
