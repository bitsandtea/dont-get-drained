import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import OpenAI from "openai";
import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import fs from "fs";
import os from "os";
import path from "path";

const OG_RPC = "https://evmrpc-testnet.0g.ai";
const STORAGE_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

let brokerCache: Awaited<ReturnType<typeof createZGComputeNetworkBroker>> | null = null;
let walletCache: ethers.Wallet | null = null;

function getWallet(): ethers.Wallet {
  if (walletCache) return walletCache;
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) throw new Error("OG_PRIVATE_KEY not set");
  walletCache = new ethers.Wallet(key, new ethers.JsonRpcProvider(OG_RPC));
  return walletCache;
}

async function getBroker() {
  if (brokerCache) return brokerCache;
  brokerCache = await createZGComputeNetworkBroker(getWallet());
  return brokerCache;
}

export interface InferenceResult {
  answer: string;
  chatId: string;
  model: string;
  provider: string;
  verified: boolean | null;
  teeProof: { text: string; signature: string } | null;
}

// Run inference on 0G network
export async function runInference(prompt: string): Promise<InferenceResult> {
  const broker = await getBroker();

  // Ensure ledger
  try {
    await broker.ledger.getLedger();
  } catch {
    await broker.ledger.addLedger(3);
  }

  // Find chatbot
  let services: any[];
  try {
    services = await broker.inference.listService();
  } catch (e) {
    throw new Error(
      `No inference services available on 0G network — broker unreachable: ${e instanceof Error ? e.message : e}`
    );
  }
  if (!services || services.length === 0) {
    throw new Error("No inference services available on 0G network — service list is empty");
  }
  const chatbot = services.find((s: any) => s.serviceType === "chatbot");
  if (!chatbot) throw new Error("No chatbot service found on 0G network — available types: " + services.map((s: any) => s.serviceType).join(", "));

  const providerAddr = chatbot.provider;

  // Acknowledge + fund
  try { await broker.inference.acknowledgeProviderSigner(providerAddr); } catch {}
  try { await broker.ledger.transferFund(providerAddr, "inference", ethers.parseEther("1")); } catch {}

  // Get metadata
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddr);

  // Get auth headers & send request
  const headers = await broker.inference.getRequestHeaders(providerAddr, prompt);
  const openai = new OpenAI({ baseURL: endpoint, apiKey: "" });
  const completion = await openai.chat.completions.create(
    { messages: [{ role: "user", content: prompt }], model },
    { headers: headers as unknown as Record<string, string> }
  );

  const answer = completion.choices[0].message.content || "";
  const chatId = completion.id;

  // Fetch TEE signature
  let teeProof: { text: string; signature: string } | null = null;
  try {
    const serviceUrl = (chatbot as any).url;
    const sigRes = await fetch(`${serviceUrl}/v1/proxy/signature/${chatId}?model=${model}`);
    if (sigRes.ok) teeProof = await sigRes.json();
  } catch {}

  // Verify + settle payment
  let verified: boolean | null = null;
  try {
    verified = await broker.inference.processResponse(providerAddr, chatId, answer);
  } catch {}

  return { answer, chatId, model, provider: providerAddr, verified, teeProof };
}

// Store JSON on 0G Storage, returns rootHash
export async function storeOn0G(data: object): Promise<{ rootHash: string; txHash: string }> {
  const wallet = getWallet();
  const jsonBytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
  const memData = new MemData(jsonBytes);

  const [, treeErr] = await memData.merkleTree();
  if (treeErr) throw new Error(`Merkle tree failed: ${treeErr}`);

  const indexer = new Indexer(STORAGE_INDEXER);
  const [tx, uploadErr] = await indexer.upload(memData, OG_RPC, wallet as any);
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr}`);

  const rootHash = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
  const txHash = "rootHash" in tx ? tx.txHash : tx.txHashes[0];
  return { rootHash, txHash };
}

// In-memory cache for fetched 0G Storage data
const fetchCache = new Map<string, string>();

// Fetch data from 0G Storage by rootHash
// Tries SDK download first (proper storage node discovery), falls back to REST API
export async function fetchFrom0G(rootHash: string): Promise<string> {
  const cached = fetchCache.get(rootHash);
  if (cached) return cached;

  // Method 1: SDK indexer.download (storage node discovery + Merkle verification)
  const indexer = new Indexer(STORAGE_INDEXER);
  const tmpFile = path.join(os.tmpdir(), `0g-${rootHash.slice(0, 16)}-${Date.now()}`);

  try {
    const err = await indexer.download(rootHash, tmpFile, true);
    if (err !== null) {
      throw new Error(String(err));
    }
    const text = fs.readFileSync(tmpFile, "utf-8");
    fetchCache.set(rootHash, text);
    return text;
  } catch (sdkErr) {
    console.warn(`[0G] SDK download failed for ${rootHash.slice(0, 16)}...: ${sdkErr instanceof Error ? sdkErr.message : sdkErr}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }

  // Method 2: REST API fallback
  console.log(`[0G] Trying REST fallback for ${rootHash.slice(0, 16)}...`);
  const res = await fetch(`${STORAGE_INDEXER}/file?root=${rootHash}`);
  if (!res.ok) {
    throw new Error(`0G Storage download failed (HTTP ${res.status}) for root ${rootHash.slice(0, 16)}...`);
  }

  const text = await res.text();

  // The REST endpoint returns 200 with error JSON when file is not found
  try {
    const parsed = JSON.parse(text);
    if (parsed.code && parsed.message) {
      throw new Error(`0G Storage: ${parsed.message} (code ${parsed.code}) for root ${rootHash.slice(0, 16)}...`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("0G Storage:")) throw e;
  }

  fetchCache.set(rootHash, text);
  return text;
}
