import { ethers } from "ethers";

const TRADE_API = "https://trade-api.gateway.uniswap.org/v1";

export const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface UniswapQuote {
  outputAmount: string;
  outputToken: string;
  gasFeeUSD: string;
  routing: string;
  priceImpact: string;
  tx: { to: string; data: string; value: string; gasLimit?: string };
}

export interface QuotePreview {
  outputAmount: string;
  outputToken: string;
  gasFeeUSD: string;
  gasEstimate: string;
  routing: string;
  priceImpact: string;
  executionPrice: string;
}

export interface ApprovalCheck {
  isRequired: boolean;
  allowance: string;
  token: string;
  spender: string;
  amount: string;
}

/**
 * Check if token approval is needed for a swap via Uniswap Trading API.
 * Only relevant for token-to-token swaps (ETH doesn't need approval).
 */
export async function checkApproval(params: {
  tokenIn: string;
  amount: string;
  walletAddress: string;
  chainId?: number;
}): Promise<ApprovalCheck> {
  // ETH doesn't need approval
  if (params.tokenIn === ETH_ADDRESS) {
    return { isRequired: false, allowance: "0", token: params.tokenIn, spender: "", amount: params.amount };
  }

  const apiKey = process.env.UNI_KEY;
  if (!apiKey) throw new Error("UNI_KEY not set");

  const res = await fetch(`${TRADE_API}/check_approval`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      token: params.tokenIn,
      amount: params.amount,
      walletAddress: params.walletAddress,
      chainId: params.chainId ?? 1,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Approval check failed: ${err.detail || res.statusText}`);
  }

  const data = await res.json();
  return {
    isRequired: data.approval?.isRequired ?? false,
    allowance: data.approval?.allowance ?? "0",
    token: params.tokenIn,
    spender: data.approval?.spender ?? "",
    amount: params.amount,
  };
}

/**
 * Lightweight quote-only call — no executable tx, just pricing info.
 */
export async function getQuotePreview(params: {
  tokenIn: string;
  tokenOut: string;
  amountInWei: string;
  swapper: string;
  tokenOutDecimals: number;
  amountInHuman: string;
  chainId?: number;
}): Promise<QuotePreview> {
  const apiKey = process.env.UNI_KEY;
  if (!apiKey) throw new Error("UNI_KEY not set");

  const res = await fetch(`${TRADE_API}/quote`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      tokenInChainId: params.chainId ?? 1,
      tokenOutChainId: params.chainId ?? 1,
      type: "EXACT_INPUT",
      amount: params.amountInWei,
      swapper: params.swapper,
      slippageTolerance: 0.5,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Uniswap quote failed: ${err.errorCode || err.detail || res.statusText}`
    );
  }

  const data = await res.json();
  const quote = data.quote;

  const outputAmount = ethers.formatUnits(
    quote.output?.amount ?? "0",
    params.tokenOutDecimals
  );

  // Compute execution price: outputAmount / inputAmount
  const outNum = parseFloat(outputAmount);
  const inNum = parseFloat(params.amountInHuman);
  const executionPrice = inNum > 0 ? (outNum / inNum).toFixed(6) : "0";

  return {
    outputAmount,
    outputToken: params.tokenOut,
    gasFeeUSD: quote.gasFeeUSD ?? "unknown",
    gasEstimate: quote.gasEstimate ?? "unknown",
    routing: data.routing ?? "CLASSIC",
    priceImpact: quote.priceImpact
      ? (parseFloat(quote.priceImpact) * 100).toFixed(3)
      : "unknown",
    executionPrice,
  };
}

export async function getSwapQuote(params: {
  tokenIn: string;
  tokenOut: string;
  amountInWei: string;
  swapper: string;
  tokenOutDecimals: number;
  tokenInDecimals?: number;
  chainId?: number;
}): Promise<UniswapQuote> {
  const apiKey = process.env.UNI_KEY;
  if (!apiKey) throw new Error("UNI_KEY not set");

  const headers = {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // 1. Get quote
  const quoteRes = await fetch(`${TRADE_API}/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      // Always chain 1 — Uniswap API doesn't support 31337; our Anvil
      // is a mainnet fork so the same contracts/pools exist.
      tokenInChainId: params.chainId ?? 1,
      tokenOutChainId: params.chainId ?? 1,
      type: "EXACT_INPUT",
      amount: params.amountInWei,
      swapper: params.swapper,
      slippageTolerance: 0.5,
    }),
  });

  if (!quoteRes.ok) {
    const err = await quoteRes.json().catch(() => ({}));
    throw new Error(
      `Uniswap quote failed: ${err.errorCode || err.detail || quoteRes.statusText}`
    );
  }

  const quoteData = await quoteRes.json();

  // 2. Get executable swap transaction
  const swapRes = await fetch(`${TRADE_API}/swap`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      quote: quoteData.quote,
      simulateTransaction: false,
    }),
  });

  if (!swapRes.ok) {
    const err = await swapRes.json().catch(() => ({}));
    throw new Error(
      `Uniswap swap failed: ${err.errorCode || err.detail || swapRes.statusText}`
    );
  }

  const swapData = await swapRes.json();
  const tx = swapData.swap;

  const outputAmount = ethers.formatUnits(
    quoteData.quote.output?.amount ?? "0",
    params.tokenOutDecimals
  );

  const priceImpact = quoteData.quote.priceImpact
    ? (parseFloat(quoteData.quote.priceImpact) * 100).toFixed(3)
    : "unknown";

  return {
    outputAmount,
    outputToken: params.tokenOut,
    gasFeeUSD: quoteData.quote.gasFeeUSD ?? "unknown",
    routing: quoteData.routing ?? "CLASSIC",
    priceImpact,
    tx: {
      to: tx.to,
      data: tx.data,
      value: tx.value,
      gasLimit: tx.gasLimit,
    },
  };
}
