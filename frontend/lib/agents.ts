import { ethers } from "ethers";
import { AGENT_DIRECTORY_ABI } from "./contracts";

// --- Types ---

export interface AgentConfig {
  id: string;               // bytes32 hex
  name: string;
  description: string;
  promptCid: string;        // 0G Storage rootHash of prompt template
  pricePerInference: bigint;
  capabilities: string[];
  active: boolean;
  totalInferences: number;
  creator: string;
  createdAt: number;
}

export interface AgentVerdict {
  agentId: string;
  name: string;
  verdict: boolean;
  notes: string;
  teeProof: { text: string; signature: string } | null;
  verified: boolean | null;
  chatId: string;
}

export type AggregationPolicy = "unanimous" | "majority" | "anyReject";

// --- Aggregation ---

export function aggregateVerdicts(
  verdicts: AgentVerdict[],
  policy: AggregationPolicy
): boolean {
  if (verdicts.length === 0) return false;
  const approvals = verdicts.filter((v) => v.verdict).length;
  switch (policy) {
    case "unanimous":
      return approvals === verdicts.length;
    case "majority":
      return approvals > verdicts.length / 2;
    case "anyReject":
      return approvals === verdicts.length;
    default:
      return false;
  }
}

export function policyFromUint8(val: number): AggregationPolicy {
  switch (val) {
    case 0:
      return "unanimous";
    case 1:
      return "majority";
    case 2:
      return "anyReject";
    default:
      return "unanimous";
  }
}

// --- Contract helpers ---

const OG_RPC = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";

function getDirectoryContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const address = process.env.NEXT_PUBLIC_DIRECTORY_ADDRESS;
  if (!address) throw new Error("NEXT_PUBLIC_DIRECTORY_ADDRESS not set");
  const provider = signerOrProvider || new ethers.JsonRpcProvider(OG_RPC);
  return new ethers.Contract(address, AGENT_DIRECTORY_ABI, provider);
}

/** Parse raw contract Agent struct into AgentConfig */
function parseAgent(raw: any): AgentConfig {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    promptCid: raw.promptCid,
    pricePerInference: BigInt(raw.pricePerInference),
    capabilities: raw.capabilities ? raw.capabilities.split(",").map((c: string) => c.trim()).filter(Boolean) : [],
    active: raw.active,
    totalInferences: Number(raw.totalInferences),
    creator: raw.creator,
    createdAt: Number(raw.createdAt),
  };
}

/** List all agents from the AgentDirectory on 0G testnet */
export async function listAgents(): Promise<AgentConfig[]> {
  const directory = getDirectoryContract();
  const rawAgents = await directory.getAllAgents();
  return rawAgents.map(parseAgent);
}

/** Get a single agent by ID */
export async function getAgent(agentId: string): Promise<AgentConfig> {
  const directory = getDirectoryContract();
  const raw = await directory.getAgent(agentId);
  return parseAgent(raw);
}

/** Register a new agent on-chain (requires OG_PRIVATE_KEY for signing) */
export async function registerAgentOnChain(params: {
  name: string;
  description: string;
  promptCid: string;
  pricePerInference: bigint;
  capabilities: string;
}): Promise<{ agentId: string; tx: string }> {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("OG_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(OG_RPC);
  const wallet = new ethers.Wallet(key, provider);
  const directory = getDirectoryContract(wallet);

  const tx = await directory.registerAgent(
    params.name,
    params.description,
    params.promptCid,
    params.pricePerInference,
    params.capabilities
  );
  const receipt = await tx.wait();

  // Extract agentId from AgentRegistered event
  const event = receipt.logs
    .map((log: any) => {
      try { return directory.interface.parseLog(log); } catch { return null; }
    })
    .find((e: any) => e?.name === "AgentRegistered");

  const agentId = event?.args?.id || "0x";
  return { agentId, tx: receipt.hash };
}

/** Update an agent's prompt on-chain */
export async function updateAgentPromptOnChain(
  agentId: string,
  newPromptCid: string
): Promise<string> {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("OG_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(OG_RPC);
  const wallet = new ethers.Wallet(key, provider);
  const directory = getDirectoryContract(wallet);

  const tx = await directory.updatePrompt(agentId, newPromptCid);
  const receipt = await tx.wait();
  return receipt.hash;
}
