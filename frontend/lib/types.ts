export type QuotePreview = {
  outputAmount: string;
  outputToken: string;
  gasFeeUSD: string;
  gasEstimate: string;
  routing: string;
  priceImpact: string;
  executionPrice: string;
};

export type AssetChange = {
  asset: string;
  changeType: string;
  from: string;
  to: string;
  rawAmount: string;
  amount: string;
  symbol: string;
  decimals: number;
  contractAddress?: string;
  tokenId?: string;
};

export type SimulationResult = {
  changes: AssetChange[];
  gasUsed?: string;
  error?: unknown;
};

export type AgentVerdictResult = {
  agentId: string;
  name: string;
  verdict: boolean;
  notes: string;
  teeProof: { text: string; signature: string } | null;
  verified: boolean | null;
  chatId: string;
};

export type ReviewResult = {
  txHash: string;
  swapTx: { to: string; data: string; value: string; gasLimit?: string };
  verdict: boolean;
  finalVerdict: boolean;
  policy: string;
  agents: AgentVerdictResult[];
  quote: string;
  gasFeeUSD: string;
  routing: string;
  aiAnswer: string;
  teeProof: { text: string; signature: string } | null;
  verified: boolean | null;
  rootHash: string;
  storageTxHash: string;
  simulation: SimulationResult | null;
};

export type ApproveResult = {
  success: boolean;
  txHash: string;
  blockNumber: number;
  approved: boolean;
};
