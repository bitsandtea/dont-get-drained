/**
 * upload-rekt-to-0g.ts
 *
 * Uploads rekt analysis result JSONs to 0G Storage concurrently using
 * ethers.NonceManager for safe parallel tx submission from one wallet.
 *
 * Idempotent — skips articles already in the registry.
 *
 * Usage:
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-to-0g.ts              # upload 5 test files
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-to-0g.ts --all        # upload all files
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-to-0g.ts --limit=20
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-to-0g.ts --all --batch=10
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(
  path.resolve(__dirname, "../frontend/package.json")
);

const { ethers } = require("ethers");
const { Indexer, MemData } = require("@0gfoundation/0g-ts-sdk");

const OG_RPC = "https://evmrpc-testnet.0g.ai";
const STORAGE_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

const RESULTS_DIR = path.join(__dirname, "analysis", "results");
const REGISTRY_PATH = path.join(__dirname, "analysis", "0g-registry.json");
const STORAGE_INDEX_PATH = path.join(__dirname, "..", "frontend", "storage-index.json");

const SUBMIT_SIG = ethers.id("Submit(address,bytes32,uint256,uint256,uint256,uint256)");

async function parseSubmissionIndex(provider: any, txHash: string): Promise<number | null> {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;
    for (const log of receipt.logs) {
      if (log.topics[0] === SUBMIT_SIG) {
        return Number(BigInt(log.data.slice(0, 66)));
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface RegistryEntry {
  article_id: string;
  rootHash: string;
  txHash: string;
  submissionIndex: number | null;
  size: number;
  uploadedAt: string;
}

function loadRegistry(): Record<string, RegistryEntry> {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveRegistry(reg: Record<string, RegistryEntry>) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function flushToStorageIndex(entries: RegistryEntry[], wallet: string) {
  let existing: any[] = [];
  try {
    existing = JSON.parse(fs.readFileSync(STORAGE_INDEX_PATH, "utf-8"));
  } catch { /* empty */ }
  const existingHashes = new Set(existing.map((e: any) => e.rootHash));
  const newEntries = entries
    .filter((e) => !existingHashes.has(e.rootHash))
    .map((e) => ({
      rootHash: e.rootHash,
      txHash: e.txHash,
      submissionIndex: e.submissionIndex,
      name: `rekt/${e.article_id}.json`,
      size: e.size,
      wallet,
      timestamp: Date.now(),
      contentType: "application/json",
    }));
  if (newEntries.length === 0) return;
  fs.writeFileSync(
    STORAGE_INDEX_PATH,
    JSON.stringify([...newEntries, ...existing], null, 2)
  );
}

// Upload one file — each call gets its own Indexer instance + the shared NonceManager wallet
async function uploadOne(
  file: string,
  label: string,
  managedWallet: any,
  provider: any,
): Promise<RegistryEntry | null> {
  const articleId = file.replace(".json", "");
  const filePath = path.join(RESULTS_DIR, file);
  const jsonStr = fs.readFileSync(filePath, "utf-8");
  const jsonBytes = new TextEncoder().encode(jsonStr);

  try {
    const memData = new MemData(jsonBytes);
    const [, treeErr] = await memData.merkleTree();
    if (treeErr) throw new Error(`Merkle tree: ${treeErr}`);

    // Each concurrent upload needs its own indexer (internal state)
    const indexer = new Indexer(STORAGE_INDEXER);

    const [tx, uploadErr] = await indexer.upload(
      memData, OG_RPC, managedWallet as any, undefined,
      { Retries: 3, Interval: 5, MaxGasPrice: 0 },
    );
    if (uploadErr !== null) throw new Error(`Upload: ${uploadErr}`);

    const rootHash = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
    const txHash = "rootHash" in tx ? tx.txHash : tx.txHashes[0];
    const submissionIndex = await parseSubmissionIndex(provider, txHash);

    console.log(`  ${label} OK ${articleId} -> ${rootHash.slice(0, 20)}...`);

    return {
      article_id: articleId,
      rootHash,
      txHash,
      submissionIndex,
      size: jsonBytes.length,
      uploadedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 100) : String(err);
    console.error(`  ${label} FAIL ${articleId}: ${msg}`);
    return null;
  }
}

async function main() {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) {
    console.error("Error: OG_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(OG_RPC);
  const baseWallet = new ethers.Wallet(key, provider);
  // NonceManager queues concurrent sendTransaction calls with sequential nonces
  const managedWallet = new ethers.NonceManager(baseWallet);
  const walletAddr = baseWallet.address;

  // Parse args
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limitArg = args.find((a: string) => a.startsWith("--limit="));
  const batchArg = args.find((a: string) => a.startsWith("--batch="));
  const limit = all ? Infinity : (limitArg ? parseInt(limitArg.split("=")[1], 10) : 5);
  const batchSize = batchArg ? parseInt(batchArg.split("=")[1], 10) : 5;

  const registry = loadRegistry();
  const alreadyUploaded = new Set(Object.keys(registry));

  const allFiles = fs.readdirSync(RESULTS_DIR).filter((f: string) => f.endsWith(".json"));
  const toUpload = allFiles
    .filter((f: string) => !alreadyUploaded.has(f.replace(".json", "")))
    .slice(0, limit);

  console.log(`\n=== 0G Storage Concurrent Upload ===`);
  console.log(`Wallet:           ${walletAddr}`);
  console.log(`Total results:    ${allFiles.length}`);
  console.log(`Already uploaded: ${alreadyUploaded.size}`);
  console.log(`To upload:        ${toUpload.length}`);
  console.log(`Batch size:       ${batchSize} concurrent`);
  console.log();

  const balanceBefore = await provider.getBalance(walletAddr);
  console.log(`Wallet balance:   ${ethers.formatEther(balanceBefore)} A0GI\n`);

  let successCount = 0;
  let failCount = 0;
  const t0 = Date.now();

  for (let batchStart = 0; batchStart < toUpload.length; batchStart += batchSize) {
    const batch = toUpload.slice(batchStart, batchStart + batchSize);
    const batchNum = Math.floor(batchStart / batchSize) + 1;
    const totalBatches = Math.ceil(toUpload.length / batchSize);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const rate = successCount > 0 ? (successCount / ((Date.now() - t0) / 1000)).toFixed(2) : "---";

    console.log(`\n--- Batch ${batchNum}/${totalBatches} (${batch.length} files) [${elapsed}s, ${rate} files/s] ---`);

    // Fire all uploads in this batch concurrently — NonceManager handles nonces
    const results = await Promise.allSettled(
      batch.map((file: string, i: number) =>
        uploadOne(file, `[${batchStart + i + 1}/${toUpload.length}]`, managedWallet, provider)
      )
    );

    const batchEntries: RegistryEntry[] = [];
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        const entry = result.value;
        registry[entry.article_id] = entry;
        batchEntries.push(entry);
        successCount++;
      } else {
        failCount++;
      }
    }

    // Flush after each batch
    if (batchEntries.length > 0) {
      saveRegistry(registry);
      flushToStorageIndex(batchEntries, walletAddr);
    }
  }

  // Summary
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const balanceAfter = await provider.getBalance(walletAddr);
  const totalCost = balanceBefore - balanceAfter;

  console.log(`\n=== Summary ===`);
  console.log(`Uploaded:       ${successCount}/${toUpload.length} (${failCount} failed)`);
  console.log(`Time:           ${elapsed}s`);
  console.log(`Total cost:     ${ethers.formatEther(totalCost)} A0GI`);
  console.log(`Balance after:  ${ethers.formatEther(balanceAfter)} A0GI`);
  console.log(`Registry:       ${Object.keys(registry).length}/${allFiles.length} entries`);

  if (successCount > 0) {
    const avgCost = totalCost / BigInt(successCount);
    const remaining = allFiles.length - Object.keys(registry).length;
    if (remaining > 0) {
      console.log(`\nAvg cost/file:  ${ethers.formatEther(avgCost)} A0GI`);
      console.log(`Remaining:      ${remaining} files`);
      console.log(`Est. remaining: ${ethers.formatEther(avgCost * BigInt(remaining))} A0GI`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
