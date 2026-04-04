// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
interface IUniswapV2Router02 {
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function WETH() external pure returns (address);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function symbol() external view returns (string memory);
}

contract ForkUniswapTest is Test {
    // Mainnet addresses
    IUniswapV2Router02 constant UNISWAP_V2_ROUTER =
        IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;

    address user;

    function setUp() public {
        user = makeAddr("user");
        vm.deal(user, 100 ether);
    }

    /// @notice Get a price quote: how much USDC for 1 ETH?
    function test_GetQuote_ETH_to_USDC() public view {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        uint256[] memory amounts = UNISWAP_V2_ROUTER.getAmountsOut(1 ether, path);

        console.log("1 ETH =", amounts[1] / 1e6, "USDC");
        assertGt(amounts[1], 0, "Quote should be > 0");
    }

    /// @notice Get a multi-hop quote: ETH -> USDC -> DAI
    function test_GetQuote_MultiHop() public view {
        address[] memory path = new address[](3);
        path[0] = WETH;
        path[1] = USDC;
        path[2] = DAI;

        uint256[] memory amounts = UNISWAP_V2_ROUTER.getAmountsOut(1 ether, path);

        console.log("1 ETH -> USDC:", amounts[1] / 1e6);
        console.log("USDC -> DAI:", amounts[2] / 1e18);
        assertGt(amounts[2], 0);
    }

    /// @notice Actually swap ETH for USDC on the fork
    function test_SwapETHForUSDC() public {
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        vm.startPrank(user);

        uint256[] memory amounts = UNISWAP_V2_ROUTER.swapExactETHForTokens{value: 1 ether}(
            0, // amountOutMin (0 for testing — use proper slippage in prod)
            path,
            user,
            block.timestamp + 300
        );

        uint256 usdcBalance = IERC20(USDC).balanceOf(user);
        console.log("Swapped 1 ETH for", usdcBalance / 1e6, "USDC");
        assertEq(usdcBalance, amounts[1]);
        assertGt(usdcBalance, 0);

        vm.stopPrank();
    }

}
