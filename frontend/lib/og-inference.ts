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
  const t0 = Date.now();
  console.log(`[0G-INFERENCE] ========================================`);
  console.log(`[0G-INFERENCE] Starting inference request`);
  console.log(`[0G-INFERENCE] Prompt length: ${prompt.length} chars`);

  const broker = await getBroker();
  console.log(`[0G-INFERENCE] Broker ready (${Date.now() - t0}ms)`);

  // Ensure ledger
  try {
    await broker.ledger.getLedger();
    console.log(`[0G-INFERENCE] Ledger exists`);
  } catch {
    console.log(`[0G-INFERENCE] Creating new ledger...`);
    await broker.ledger.addLedger(3);
    console.log(`[0G-INFERENCE] Ledger created`);
  }

  // Find chatbot
  let services: any[];
  try {
    services = await broker.inference.listService();
    console.log(`[0G-INFERENCE] Found ${services.length} service(s): ${services.map((s: any) => `${s.serviceType}@${s.provider?.slice(0, 10)}...`).join(", ")}`);
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
  console.log(`[0G-INFERENCE] Using chatbot provider: ${providerAddr}`);

  // Acknowledge + fund
  try {
    await broker.inference.acknowledgeProviderSigner(providerAddr);
    console.log(`[0G-INFERENCE] Provider signer acknowledged`);
  } catch (e) {
    console.log(`[0G-INFERENCE] acknowledgeProviderSigner skipped: ${e instanceof Error ? e.message : e}`);
  }
  try {
    await broker.ledger.transferFund(providerAddr, "inference", ethers.parseEther("1"));
    console.log(`[0G-INFERENCE] Funded provider with 1 token`);
  } catch (e) {
    console.log(`[0G-INFERENCE] transferFund skipped: ${e instanceof Error ? e.message : e}`);
  }

  // Get metadata
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddr);
  console.log(`[0G-INFERENCE] Endpoint: ${endpoint}`);
  console.log(`[0G-INFERENCE] Model: ${model}`);

  // Get auth headers & send request
  const headers = await broker.inference.getRequestHeaders(providerAddr, prompt);
  console.log(`[0G-INFERENCE] Auth headers obtained (${Date.now() - t0}ms)`);
  console.log(`[0G-INFERENCE] Sending request to OpenAI-compatible endpoint...`);

  const tReq = Date.now();
  const openai = new OpenAI({ baseURL: endpoint, apiKey: "" });
  const completion = await openai.chat.completions.create(
    { messages: [{ role: "user", content: prompt }], model },
    { headers: headers as unknown as Record<string, string> }
  );
  console.log(`[0G-INFERENCE] Response received in ${Date.now() - tReq}ms`);

  const answer = completion.choices[0].message.content || "";
  const chatId = completion.id;
  console.log(`[0G-INFERENCE] ChatID: ${chatId}`);
  console.log(`[0G-INFERENCE] Answer (${answer.length} chars): ${answer.slice(0, 1000)}${answer.length > 1000 ? "... [truncated]" : ""}`);
  console.log(`[0G-INFERENCE] Usage: ${JSON.stringify(completion.usage)}`);

  // Fetch TEE signature
  let teeProof: { text: string; signature: string } | null = null;
  try {
    const serviceUrl = (chatbot as any).url;
    console.log(`[0G-INFERENCE] Fetching TEE signature from ${serviceUrl}/v1/proxy/signature/${chatId}`);
    const sigRes = await fetch(`${serviceUrl}/v1/proxy/signature/${chatId}?model=${model}`);
    console.log(`[0G-INFERENCE] TEE signature response: ${sigRes.status}`);
    if (sigRes.ok) {
      teeProof = await sigRes.json();
      console.log(`[0G-INFERENCE] TEE proof obtained — signature: ${teeProof?.signature?.slice(0, 40)}...`);
    } else {
      console.log(`[0G-INFERENCE] TEE signature not available (${sigRes.status})`);
    }
  } catch (e) {
    console.log(`[0G-INFERENCE] TEE signature fetch failed: ${e instanceof Error ? e.message : e}`);
  }

  // Verify + settle payment
  let verified: boolean | null = null;
  try {
    console.log(`[0G-INFERENCE] Verifying response & settling payment...`);
    verified = await broker.inference.processResponse(providerAddr, chatId, answer);
    console.log(`[0G-INFERENCE] Verification result: ${verified}`);
  } catch (e) {
    console.log(`[0G-INFERENCE] processResponse failed: ${e instanceof Error ? e.message : e}`);
  }

  console.log(`[0G-INFERENCE] Total time: ${Date.now() - t0}ms`);
  console.log(`[0G-INFERENCE] ========================================`);

  return { answer, chatId, model, provider: providerAddr, verified, teeProof };
}

// Parse the Submit event's submissionIndex from a tx receipt
// The SDK does this internally but doesn't expose it in the return value
const SUBMIT_EVENT_SIGNATURE = ethers.id("Submit(address,bytes32,uint256,uint256,uint256,uint256)");

function parseSubmissionIndex(provider: ethers.Provider, txHash: string): Promise<number | null> {
  return provider.getTransactionReceipt(txHash).then((receipt) => {
    if (!receipt) return null;
    for (const log of receipt.logs) {
      if (log.topics[0] === SUBMIT_EVENT_SIGNATURE) {
        // submissionIndex is the 3rd indexed/data field — decode from log data
        // The event is: Submit(address indexed sender, bytes32 indexed identity, uint256 submissionIndex, ...)
        // submissionIndex is the first non-indexed param, so it's in log.data
        const submissionIndex = Number(BigInt(log.data.slice(0, 66)));
        return submissionIndex;
      }
    }
    return null;
  }).catch(() => null);
}

// Store JSON on 0G Storage, returns rootHash
export async function storeOn0G(data: object): Promise<{ rootHash: string; txHash: string; submissionIndex: number | null }> {
  const wallet = getWallet();
  const jsonStr = JSON.stringify(data, null, 2);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const memData = new MemData(jsonBytes);

  const [, treeErr] = await memData.merkleTree();
  if (treeErr) throw new Error(`Merkle tree failed: ${treeErr}`);

  const indexer = new Indexer(STORAGE_INDEXER);
  const retryOpts = { Retries: 3, Interval: 5, MaxGasPrice: 0 };

  const [tx, uploadErr] = await indexer.upload(
    memData, OG_RPC, wallet as any, undefined, retryOpts,
  );
  if (uploadErr !== null) throw new Error(`Upload failed: ${uploadErr}`);

  const rootHash = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
  const txHash = "rootHash" in tx ? tx.txHash : tx.txHashes[0];

  // Extract submissionIndex from tx receipt for storage explorer link
  const provider = new ethers.JsonRpcProvider(OG_RPC);
  const submissionIndex = await parseSubmissionIndex(provider, txHash);
  if (submissionIndex !== null) {
    console.log(`[0G] Submission index: ${submissionIndex} — https://storagescan-galileo.0g.ai/submission/${submissionIndex}`);
  }

  // Verify the upload is retrievable (read-after-write)
  const tmpFile = path.join(os.tmpdir(), `0g-verify-${Date.now()}`);
  try {
    const dlErr = await indexer.download(rootHash, tmpFile, true);
    if (dlErr !== null) {
      console.warn(`[0G] Upload succeeded but verification download failed: ${dlErr}`);
    } else {
      const readBack = fs.readFileSync(tmpFile, "utf-8");
      if (readBack !== jsonStr) {
        console.warn(`[0G] Upload verification mismatch! Uploaded ${jsonStr.length} bytes, got back ${readBack.length} bytes`);
      } else {
        console.log(`[0G] Upload verified: ${rootHash.slice(0, 16)}... (${jsonStr.length} bytes)`);
      }
    }
  } catch (verifyErr) {
    console.warn(`[0G] Upload verification failed: ${verifyErr instanceof Error ? verifyErr.message : verifyErr}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }

  return { rootHash, txHash, submissionIndex };
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
