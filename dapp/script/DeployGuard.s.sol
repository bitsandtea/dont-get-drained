// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/InferenceGuard.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce)
        external
        returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata owners,
        uint256 threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;

    function execTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        bytes memory signatures
    ) external payable returns (bool success);

    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);

    function nonce() external view returns (uint256);
    function setGuard(address guard) external;
}

contract DeployGuard is Script {
    // Safe v1.3.0 mainnet
    address constant SAFE_SINGLETON = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
    ISafeProxyFactory constant SAFE_FACTORY =
        ISafeProxyFactory(0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2);
    address constant FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;

    function run() external {
        uint256 pk = vm.envUint("PKEY");
        address owner = vm.addr(pk);

        uint256 relayerPk = vm.envUint("RELAYER_PRIVATE_KEY");
        address relayer = vm.addr(relayerPk);

        console.log("=== DEPLOYMENT CONFIG ===");
        console.log("Owner (Safe signer):", owner);
        console.log("Relayer:            ", relayer);
        console.log("");

        vm.startBroadcast(pk);

        // --- 1. Deploy Safe ---
        address[] memory owners = new address[](1);
        owners[0] = owner;

        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (owners, 1, address(0), "", FALLBACK_HANDLER, address(0), 0, payable(address(0)))
        );

        address safeAddr = SAFE_FACTORY.createProxyWithNonce(SAFE_SINGLETON, initializer, block.timestamp);
        ISafe safe = ISafe(safeAddr);

        console.log("=== DEPLOYED ===");
        console.log("Safe:     ", safeAddr);

        // --- 2. Deploy InferenceGuard ---
        InferenceGuard guard = new InferenceGuard(safeAddr, relayer);
        console.log("InferenceGuard:", address(guard));

        // --- 3. Fund Safe with ETH (if deployer has balance) ---
        if (owner.balance > 6 ether) {
            (bool sent,) = safeAddr.call{value: 5 ether}("");
            require(sent, "Failed to fund Safe");
            console.log("Funded Safe with 5 ETH");
        } else {
            console.log("Skipped funding (fund Safe manually)");
        }

        // --- 4. Set guard on Safe (requires signed Safe tx) ---
        _setGuard(safe, safeAddr, address(guard), pk);
        console.log("Guard installed on Safe");

        vm.stopBroadcast();

        // --- Summary ---
        console.log("");
        console.log("=== COPY THESE TO frontend/.env.local ===");
        console.log("");
        console.log("NEXT_PUBLIC_GUARD_ADDRESS=", address(guard));
        console.log("NEXT_PUBLIC_SAFE_ADDRESS= ", safeAddr);
    }

    function _setGuard(ISafe safe, address safeAddr, address guardAddr, uint256 pk) internal {
        bytes memory data = abi.encodeCall(ISafe.setGuard, (guardAddr));
        bytes32 txHash = safe.getTransactionHash(safeAddr, 0, data, 0, 0, 0, 0, address(0), address(0), safe.nonce());
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, txHash);
        require(
            safe.execTransaction(safeAddr, 0, data, 0, 0, 0, 0, address(0), payable(address(0)), abi.encodePacked(r, s, v)),
            "Failed to set guard"
        );
    }
}
