// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/MyToken.sol";

// Safe v1.3.0 interfaces (deployed on mainnet)
interface ISafeProxyFactory {
    function createProxyWithNonce(
        address singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);
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
        uint8 operation, // 0 = Call, 1 = DelegateCall
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
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

contract ForkSafeTest is Test {
    // Safe v1.3.0 mainnet addresses
    address constant SAFE_SINGLETON = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
    ISafeProxyFactory constant SAFE_FACTORY =
        ISafeProxyFactory(0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2);
    address constant FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;

    // Uniswap + tokens
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    uint256 ownerPk;
    address owner;
    ISafe safe;

    function setUp() public {
        // Create owner with known private key (needed for signing)
        ownerPk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        owner = vm.addr(ownerPk);
        vm.deal(owner, 100 ether);

        // Deploy 1/1 Safe
        address[] memory owners = new address[](1);
        owners[0] = owner;

        bytes memory initializer = abi.encodeCall(
            ISafe.setup,
            (owners, 1, address(0), "", FALLBACK_HANDLER, address(0), 0, payable(address(0)))
        );

        address safeAddr = SAFE_FACTORY.createProxyWithNonce(SAFE_SINGLETON, initializer, block.timestamp);
        safe = ISafe(safeAddr);

        console.log("Safe deployed at:", safeAddr);

        // Fund the Safe with ETH
        vm.prank(owner);
        (bool sent,) = safeAddr.call{value: 10 ether}("");
        require(sent);
        console.log("Safe ETH balance:", safeAddr.balance / 1e18, "ETH");
    }

    /// @notice Verify Safe config is 1/1
    function test_SafeSetup() public view {
        assertEq(safe.getThreshold(), 1);
        assertTrue(safe.isOwner(owner));

        address[] memory owners = safe.getOwners();
        assertEq(owners.length, 1);
        assertEq(owners[0], owner);

        console.log("Safe owner:", owner);
        console.log("Threshold: 1 of 1");
    }

    /// @notice Deploy MyToken, send some to Safe, then transfer out via Safe tx
    function test_SafeTransferMyToken() public {
        // Deploy token and send to Safe
        MyToken token = new MyToken(1_000_000);
        token.transfer(address(safe), 500_000);
        assertEq(token.balances(address(safe)), 500_000);
        console.log("Safe MyToken balance:", token.balances(address(safe)));

        // Build tx: Safe transfers 100 tokens to owner
        bytes memory txData = abi.encodeCall(MyToken.transfer, (owner, 100));

        _execSafeTx(address(token), 0, txData);

        assertEq(token.balances(owner), 100);
        assertEq(token.balances(address(safe)), 499_900);
        console.log("Owner received 100 MyTokens via Safe tx");
    }

    /// @notice Safe swaps ETH for USDC on Uniswap
    function test_SafeSwapOnUniswap() public {
        // Build Uniswap swap calldata
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        bytes memory txData = abi.encodeWithSignature(
            "swapExactETHForTokens(uint256,address[],address,uint256)",
            0, // amountOutMin (0 for test)
            path,
            address(safe), // tokens go back to Safe
            block.timestamp + 300
        );

        uint256 usdcBefore = IERC20(USDC).balanceOf(address(safe));

        _execSafeTx(UNISWAP_V2_ROUTER, 1 ether, txData);

        uint256 usdcAfter = IERC20(USDC).balanceOf(address(safe));
        console.log("Safe swapped 1 ETH for", (usdcAfter - usdcBefore) / 1e6, "USDC");
        assertGt(usdcAfter, usdcBefore);
    }

    // --- Helper: sign and execute a Safe transaction ---

    function _execSafeTx(address to, uint256 value, bytes memory data) internal {
        uint256 nonce = safe.nonce();

        bytes32 txHash = safe.getTransactionHash(
            to, value, data,
            0,    // operation: Call
            0,    // safeTxGas
            0,    // baseGas
            0,    // gasPrice
            address(0), // gasToken
            address(0), // refundReceiver
            nonce
        );

        // Sign with owner's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, txHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Execute
        vm.prank(owner);
        bool success = safe.execTransaction(
            to, value, data,
            0, 0, 0, 0,
            address(0), payable(address(0)),
            signature
        );
        require(success, "Safe tx failed");
    }
}
