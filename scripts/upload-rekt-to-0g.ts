/**
 * upload-rekt-to-0g.ts
 *
 * Uploads rekt analysis result JSONs to 0G Storage and produces a registry
 * mapping article_id → rootHash. Also registers each file in the frontend
 * storage-index.json so they show up on the /og-storage page.
 *
 * Usage:
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-to-0g.ts          # upload 5 test files
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-to-0g.ts --all    # upload all files
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-to-0g.ts --limit=20
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

// Resolve dependencies from frontend/node_modules (no root package.json)
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

// Parse submission index from tx receipt
const SUBMIT_SIG = ethers.id("Submit(address,bytes32,uint256,uint256,uint256,uint256)");

async function parseSubmissionIndex(provider: ethers.Provider, txHash: string): Promise<number | null> {
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

// Append to frontend storage-index.json so files show on /og-storage page
function addToStorageIndex(entry: RegistryEntry, wallet: string) {
  let entries: any[] = [];
  try {
    entries = JSON.parse(fs.readFileSync(STORAGE_INDEX_PATH, "utf-8"));
  } catch { /* empty */ }
  if (entries.some((e: any) => e.rootHash === entry.rootHash)) return;
  entries.unshift({
    rootHash: entry.rootHash,
    txHash: entry.txHash,
    submissionIndex: entry.submissionIndex,
    name: `rekt/${entry.article_id}.json`,
    size: entry.size,
    wallet,
    timestamp: Date.now(),
    contentType: "application/json",
  });
  fs.writeFileSync(STORAGE_INDEX_PATH, JSON.stringify(entries, null, 2));
}

async function main() {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) {
    console.error("Error: OG_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(OG_RPC);
  const wallet = new ethers.Wallet(key, provider);
  const indexer = new Indexer(STORAGE_INDEXER);
  const walletAddr = wallet.address;

  // Parse args
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = all ? Infinity : (limitArg ? parseInt(limitArg.split("=")[1], 10) : 5);

  // Load existing registry to skip already-uploaded files
  const registry = loadRegistry();
  const alreadyUploaded = new Set(Object.keys(registry));

  // Get files to upload
  const allFiles = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
  const toUpload = allFiles
    .filter((f) => !alreadyUploaded.has(f.replace(".json", "")))
    .slice(0, limit);

  console.log(`\n=== 0G Storage Upload ===`);
  console.log(`Wallet:           ${walletAddr}`);
  console.log(`Total results:    ${allFiles.length}`);
  console.log(`Already uploaded: ${alreadyUploaded.size}`);
  console.log(`To upload:        ${toUpload.length}`);
  console.log();

  // Check wallet balance before starting
  const balance = await provider.getBalance(walletAddr);
  const balEth = ethers.formatEther(balance);
  console.log(`Wallet balance:   ${balEth} A0GI`);
  console.log();

  let totalGasUsed = BigInt(0);
  let totalCostWei = BigInt(0);
  let successCount = 0;

  for (let i = 0; i < toUpload.length; i++) {
    const file = toUpload[i];
    const articleId = file.replace(".json", "");
    const filePath = path.join(RESULTS_DIR, file);
    const jsonStr = fs.readFileSync(filePath, "utf-8");
    const jsonBytes = new TextEncoder().encode(jsonStr);

    console.log(`[${i + 1}/${toUpload.length}] Uploading ${articleId} (${jsonBytes.length} bytes)...`);

    try {
      const memData = new MemData(jsonBytes);
      const [, treeErr] = await memData.merkleTree();
      if (treeErr) throw new Error(`Merkle tree: ${treeErr}`);

      const balBefore = await provider.getBalance(walletAddr);

      const [tx, uploadErr] = await indexer.upload(
        memData, OG_RPC, wallet as any, undefined,
        { Retries: 3, Interval: 5, MaxGasPrice: 0 },
      );
      if (uploadErr !== null) throw new Error(`Upload: ${uploadErr}`);

      const rootHash = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
      const txHash = "rootHash" in tx ? tx.txHash : tx.txHashes[0];

      const balAfter = await provider.getBalance(walletAddr);
      const costWei = balBefore - balAfter;
      totalCostWei += costWei;

      // Get gas details from receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      const gasUsed = receipt?.gasUsed ?? BigInt(0);
      totalGasUsed += gasUsed;

      const submissionIndex = await parseSubmissionIndex(provider, txHash);

      const entry: RegistryEntry = {
        article_id: articleId,
        rootHash,
        txHash,
        submissionIndex,
        size: jsonBytes.length,
        uploadedAt: new Date().toISOString(),
      };

      registry[articleId] = entry;
      saveRegistry(registry);
      addToStorageIndex(entry, walletAddr);
      successCount++;

      console.log(`  -> rootHash: ${rootHash.slice(0, 20)}...`);
      console.log(`  -> cost: ${ethers.formatEther(costWei)} A0GI  (gas: ${gasUsed.toString()})`);
      if (submissionIndex !== null) {
        console.log(`  -> explorer: https://storagescan-galileo.0g.ai/submission/${submissionIndex}`);
      }
      console.log();
    } catch (err) {
      console.error(`  -> FAILED: ${err instanceof Error ? err.message : err}`);
      console.log();
    }
  }

  // Summary
  const balanceAfter = await provider.getBalance(walletAddr);
  console.log(`\n=== Summary ===`);
  console.log(`Uploaded:       ${successCount}/${toUpload.length}`);
  console.log(`Total gas:      ${totalGasUsed.toString()}`);
  console.log(`Total cost:     ${ethers.formatEther(totalCostWei)} A0GI`);
  console.log(`Balance after:  ${ethers.formatEther(balanceAfter)} A0GI`);
  console.log(`Registry:       ${Object.keys(registry).length} entries in ${REGISTRY_PATH}`);

  if (successCount > 0 && toUpload.length <= 10) {
    // Extrapolate cost for all files
    const avgCost = totalCostWei / BigInt(successCount);
    const remaining = allFiles.length - Object.keys(registry).length;
    const estTotal = avgCost * BigInt(remaining);
    console.log(`\n=== Cost Estimate (all ${allFiles.length} files) ===`);
    console.log(`Avg cost/file:  ${ethers.formatEther(avgCost)} A0GI`);
    console.log(`Remaining:      ${remaining} files`);
    console.log(`Est. remaining: ${ethers.formatEther(estTotal)} A0GI`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
