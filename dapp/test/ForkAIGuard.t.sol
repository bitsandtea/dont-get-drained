// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
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

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

contract ForkInferenceGuardTest is Test {
    // Mainnet addresses
    address constant SAFE_SINGLETON = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
    ISafeProxyFactory constant SAFE_FACTORY =
        ISafeProxyFactory(0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2);
    address constant FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    uint256 ownerPk;
    address owner;

    uint256 relayerPk;
    address relayer;

    ISafe safe;
    InferenceGuard guard;

    function setUp() public {
        ownerPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        owner = vm.addr(ownerPk);
        relayerPk = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
        relayer = vm.addr(relayerPk);

        vm.deal(owner, 100 ether);
        vm.deal(relayer, 10 ether);

        // Deploy 1/1 Safe
        address[] memory owners = new address[](1);
        owners[0] = owner;
        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (owners, 1, address(0), "", FALLBACK_HANDLER, address(0), 0, payable(address(0)))
        );
        address safeAddr = SAFE_FACTORY.createProxyWithNonce(SAFE_SINGLETON, initializer, block.timestamp);
        safe = ISafe(safeAddr);

        // Fund Safe
        vm.prank(owner);
        (bool sent,) = safeAddr.call{value: 10 ether}("");
        require(sent);

        // Deploy InferenceGuard
        guard = new InferenceGuard(safeAddr, relayer);
        console.log("Safe:", safeAddr);
        console.log("InferenceGuard:", address(guard));

        // Set guard on Safe
        bytes memory setGuardData = abi.encodeCall(ISafe.setGuard, (address(guard)));
        _execSafeTxRaw(safeAddr, 0, setGuardData);
        console.log("Guard installed on Safe");
    }

    /// @notice Uniswap swap BLOCKED without AI approval
    function test_SwapBlockedWithoutApproval() public {
        bytes memory swapData = _buildSwapData();
        bytes memory signature = _signSafeTx(UNISWAP_V2_ROUTER, 1 ether, swapData);

        vm.prank(owner);
        vm.expectRevert(InferenceGuard.MissingRootHash.selector);
        safe.execTransaction(UNISWAP_V2_ROUTER, 1 ether, swapData, 0, 0, 0, 0, address(0), payable(address(0)), signature);

        console.log("Swap correctly blocked - no AI approval");
    }

    /// @notice Uniswap swap APPROVED by AI → goes through
    function test_SwapApprovedByAI() public {
        bytes memory swapData = _buildSwapData();
        bytes32 rootHash = bytes32(uint256(0xdeadbeef));

        bytes32 txHash = keccak256(abi.encodePacked(
            UNISWAP_V2_ROUTER,
            uint256(1 ether),
            keccak256(swapData),
            uint8(0), uint256(0), uint256(0), uint256(0), address(0), address(0)
        ));

        // Relayer submits approval
        vm.prank(relayer);
        guard.approveTransaction(txHash, rootHash, true);
        console.log("AI verdict: APPROVED");

        assertTrue(guard.isApproved(txHash));
        assertEq(guard.getRootHash(txHash), rootHash);

        // Now execute the swap
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(safe));
        _execSafeTxRaw(UNISWAP_V2_ROUTER, 1 ether, swapData);
        uint256 usdcAfter = IERC20(USDC).balanceOf(address(safe));

        console.log("Swap executed! Got", (usdcAfter - usdcBefore) / 1e6, "USDC");
        assertGt(usdcAfter, usdcBefore);
    }

    /// @notice AI says NO → swap blocked
    function test_SwapRejectedByAI() public {
        bytes memory swapData = _buildSwapData();
        bytes32 rootHash = bytes32(uint256(0xbad0));

        bytes32 txHash = keccak256(abi.encodePacked(
            UNISWAP_V2_ROUTER,
            uint256(1 ether),
            keccak256(swapData),
            uint8(0), uint256(0), uint256(0), uint256(0), address(0), address(0)
        ));

        vm.prank(relayer);
        guard.approveTransaction(txHash, rootHash, false);
        console.log("AI verdict: REJECTED");

        assertFalse(guard.isApproved(txHash));

        // Swap should still be blocked
        bytes memory signature = _signSafeTx(UNISWAP_V2_ROUTER, 1 ether, swapData);
        vm.prank(owner);
        vm.expectRevert(InferenceGuard.NotApproved.selector);
        safe.execTransaction(UNISWAP_V2_ROUTER, 1 ether, swapData, 0, 0, 0, 0, address(0), payable(address(0)), signature);

        console.log("Swap correctly blocked - AI said no");
    }

    /// @notice Root hash reuse blocked
    function test_RootHashReuseBlocked() public {
        bytes32 rootHash = bytes32(uint256(0xaabb));
        bytes32 txHash1 = bytes32(uint256(0x1111));
        bytes32 txHash2 = bytes32(uint256(0x2222));

        vm.prank(relayer);
        guard.approveTransaction(txHash1, rootHash, true);

        vm.prank(relayer);
        vm.expectRevert(InferenceGuard.RootHashReused.selector);
        guard.approveTransaction(txHash2, rootHash, true);

        console.log("Root hash reuse correctly blocked");
    }

    /// @notice Non-relayer cannot submit approvals
    function test_NonRelayerBlocked() public {
        bytes32 txHash = bytes32(uint256(0x1234));
        bytes32 rootHash = bytes32(uint256(0x5678));

        vm.prank(owner);
        vm.expectRevert(InferenceGuard.NotRelayer.selector);
        guard.approveTransaction(txHash, rootHash, true);

        console.log("Non-relayer correctly blocked");
    }

    /// @notice Safe owner can still remove guard (emergency escape)
    function test_OwnerCanRemoveGuard() public {
        bytes memory removeGuard = abi.encodeCall(ISafe.setGuard, (address(0)));
        _execSafeTxRaw(address(safe), 0, removeGuard);
        console.log("Guard removed - emergency escape works");

        // Now swaps work without approval
        bytes memory swapData = _buildSwapData();
        uint256 usdcBefore = IERC20(USDC).balanceOf(address(safe));
        _execSafeTxRaw(UNISWAP_V2_ROUTER, 1 ether, swapData);
        uint256 usdcAfter = IERC20(USDC).balanceOf(address(safe));
        console.log("Unguarded swap got", (usdcAfter - usdcBefore) / 1e6, "USDC");
    }

    // --- Panel / Policy tests ---

    /// @notice Safe can set and read the agent panel
    function test_SetPanel() public {
        bytes32[] memory panel = new bytes32[](2);
        panel[0] = bytes32(uint256(0xaa));
        panel[1] = bytes32(uint256(0xbb));

        bytes memory data = abi.encodeCall(InferenceGuard.setPanel, (panel));
        _execSafeTxRaw(address(guard), 0, data);

        bytes32[] memory result = guard.getPanel();
        assertEq(result.length, 2);
        assertEq(result[0], panel[0]);
        assertEq(result[1], panel[1]);
    }

    /// @notice Safe can set the aggregation policy
    function test_SetPolicy() public {
        bytes memory data = abi.encodeCall(InferenceGuard.setPolicy, (1));
        _execSafeTxRaw(address(guard), 0, data);

        assertEq(guard.policy(), 1);
    }

    /// @notice Non-Safe cannot set panel
    function test_SetPanelOnlySafe() public {
        bytes32[] memory panel = new bytes32[](1);
        panel[0] = bytes32(uint256(0xcc));

        vm.prank(owner);
        vm.expectRevert("Only Safe");
        guard.setPanel(panel);
    }

    /// @notice Non-Safe cannot set policy
    function test_SetPolicyOnlySafe() public {
        vm.prank(owner);
        vm.expectRevert("Only Safe");
        guard.setPolicy(1);
    }

    /// @notice Invalid policy value reverts
    function test_SetPolicyInvalid() public {
        bytes memory data = abi.encodeCall(InferenceGuard.setPolicy, (3));

        // Execute via Safe — the inner call should revert, causing Safe execTransaction to return false
        bytes memory signature = _signSafeTx(address(guard), 0, data);
        vm.prank(owner);
        // Safe swallows the revert and emits ExecutionFailure, so just check policy unchanged
        safe.execTransaction(address(guard), 0, data, 0, 0, 0, 0, address(0), payable(address(0)), signature);
        assertEq(guard.policy(), 0); // unchanged from default
    }

    /// @notice Safe can set agentDirectory
    function test_SetAgentDirectory() public {
        address dir = address(0x1234);
        bytes memory data = abi.encodeCall(InferenceGuard.setAgentDirectory, (dir));
        _execSafeTxRaw(address(guard), 0, data);

        assertEq(guard.agentDirectory(), dir);
    }

    // --- Helpers ---

    function _buildSwapData() internal view returns (bytes memory) {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;
        return abi.encodeWithSignature(
            "swapExactETHForTokens(uint256,address[],address,uint256)",
            0, path, address(safe), block.timestamp + 300
        );
    }

    function _signSafeTx(address to, uint256 value, bytes memory data) internal view returns (bytes memory) {
        uint256 nonce = safe.nonce();
        bytes32 txHash = safe.getTransactionHash(to, value, data, 0, 0, 0, 0, address(0), address(0), nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, txHash);
        return abi.encodePacked(r, s, v);
    }

    function _execSafeTxRaw(address to, uint256 value, bytes memory data) internal {
        bytes memory signature = _signSafeTx(to, value, data);
        vm.prank(owner);
        safe.execTransaction(to, value, data, 0, 0, 0, 0, address(0), payable(address(0)), signature);
    }
}
