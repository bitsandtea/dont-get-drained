// Contract addresses — update after deployment
export const CONTRACTS = {
  // Set these after deploying on your fork/testnet
  AI_GUARD: process.env.NEXT_PUBLIC_GUARD_ADDRESS || "",
  SAFE: process.env.NEXT_PUBLIC_SAFE_ADDRESS || "",

  // Mainnet constants
  UNISWAP_V2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
};

export const AI_GUARD_ABI = [
  "function approveTransaction(bytes32 txHash, bytes32 rootHash, bool execute) external",
  "function isApproved(bytes32 txHash) external view returns (bool)",
  "function getRootHash(bytes32 txHash) external view returns (bytes32)",
  "function approvals(bytes32) external view returns (bool approved, bool consumed, bytes32 rootHash)",
  "event TransactionApproved(bytes32 indexed txHash, bytes32 rootHash, bool execute)",
];

export const UNISWAP_V2_ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
  "function WETH() external pure returns (address)",
];

export const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes signatures) public payable returns (bool)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) public view returns (bytes32)",
  "function nonce() public view returns (uint256)",
  "function approveHash(bytes32 hashToApprove) external",
  "function getOwners() public view returns (address[])",
  "function setGuard(address guard) external",
];

export const ERC20_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
];

// Safe v1.3.0 guard storage slot: keccak256("guard_manager.guard.address")
export const GUARD_STORAGE_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";

// Tokens available for swapping
export const TOKENS: Record<string, { address: string; symbol: string; decimals: number; logo: string }> = {
  USDC: { address: CONTRACTS.USDC, symbol: "USDC", decimals: 6, logo: "/tokens/usdc.svg" },
  DAI: { address: CONTRACTS.DAI, symbol: "DAI", decimals: 18, logo: "/tokens/dai.svg" },
  WETH: { address: CONTRACTS.WETH, symbol: "WETH", decimals: 18, logo: "/tokens/weth.svg" },
  AAVE: { address: CONTRACTS.AAVE, symbol: "AAVE", decimals: 18, logo: "/tokens/aave.svg" },
};
