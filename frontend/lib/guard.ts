import { ethers } from "ethers";

// Compute the same txHash the InferenceGuard contract computes
export function computeGuardTxHash(params: {
  to: string;
  value: bigint;
  data: string;
  operation?: number;
  safeTxGas?: number;
  baseGas?: number;
  gasPrice?: number;
  gasToken?: string;
  refundReceiver?: string;
}): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["address", "uint256", "bytes32", "uint8", "uint256", "uint256", "uint256", "address", "address"],
      [
        params.to,
        params.value,
        ethers.keccak256(params.data),
        params.operation ?? 0,
        params.safeTxGas ?? 0,
        params.baseGas ?? 0,
        params.gasPrice ?? 0,
        params.gasToken ?? ethers.ZeroAddress,
        params.refundReceiver ?? ethers.ZeroAddress,
      ]
    )
  );
}

// Build Uniswap V2 swap calldata
export function buildSwapCalldata(params: {
  tokenOut: string;
  recipient: string;
  amountOutMin?: bigint;
}): string {
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const iface = new ethers.Interface([
    "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
  ]);
  return iface.encodeFunctionData("swapExactETHForTokens", [
    params.amountOutMin ?? 0n,
    [WETH, params.tokenOut],
    params.recipient,
    BigInt(Math.floor(Date.now() / 1000) + 300),
  ]);
}
