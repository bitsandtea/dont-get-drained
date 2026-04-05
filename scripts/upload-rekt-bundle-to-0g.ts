/**
 * upload-rekt-bundle-to-0g.ts
 *
 * Bundles ALL rekt analysis results into a single JSON file and uploads
 * it to 0G Storage in one transaction. ~640KB, ~20 seconds total.
 *
 * The bundle format: { [article_id]: analysis_data, ... }
 *
 * Also updates:
 *   - scripts/analysis/0g-registry.json  (adds __bundle entry with rootHash)
 *   - frontend/storage-index.json        (adds entry for /og-storage page)
 *
 * Usage:
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/upload-rekt-bundle-to-0g.ts
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

async function main() {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) {
    console.error("Error: OG_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(OG_RPC);
  const wallet = new ethers.Wallet(key, provider);
  const walletAddr = wallet.address;
  const indexer = new Indexer(STORAGE_INDEXER);

  // Build the bundle: { article_id: analysis_json, ... }
  const files = fs.readdirSync(RESULTS_DIR).filter((f: string) => f.endsWith(".json"));
  console.log(`\n=== 0G Bundle Upload ===`);
  console.log(`Files to bundle: ${files.length}`);

  const bundle: Record<string, any> = {};
  for (const file of files) {
    const articleId = file.replace(".json", "");
    try {
      bundle[articleId] = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8"));
    } catch (err) {
      console.warn(`  Skipping ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const bundleStr = JSON.stringify(bundle);
  const bundleBytes = new TextEncoder().encode(bundleStr);
  console.log(`Bundle size:     ${(bundleBytes.length / 1024).toFixed(1)} KB (${Object.keys(bundle).length} entries)`);

  const balance = await provider.getBalance(walletAddr);
  console.log(`Wallet balance:  ${ethers.formatEther(balance)} A0GI`);
  console.log();

  // Upload
  console.log(`Uploading bundle to 0G Storage...`);
  const t0 = Date.now();

  const memData = new MemData(bundleBytes);
  const [, treeErr] = await memData.merkleTree();
  if (treeErr) throw new Error(`Merkle tree: ${treeErr}`);

  const [tx, uploadErr] = await indexer.upload(
    memData, OG_RPC, wallet as any, undefined,
    { Retries: 5, Interval: 10, MaxGasPrice: 0 },
  );
  if (uploadErr !== null) throw new Error(`Upload failed: ${uploadErr}`);

  const rootHash = "rootHash" in tx ? tx.rootHash : tx.rootHashes[0];
  const txHash = "rootHash" in tx ? tx.txHash : tx.txHashes[0];
  const submissionIndex = await parseSubmissionIndex(provider, txHash);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const balanceAfter = await provider.getBalance(walletAddr);
  const cost = balance - balanceAfter;

  console.log(`\nDone in ${elapsed}s`);
  console.log(`Root hash:       ${rootHash}`);
  console.log(`Tx hash:         ${txHash}`);
  console.log(`Cost:            ${ethers.formatEther(cost)} A0GI`);
  if (submissionIndex !== null) {
    console.log(`Explorer:        https://storagescan-galileo.0g.ai/submission/${submissionIndex}`);
  }

  // Update registry with bundle entry
  let registry: Record<string, any> = {};
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
  } catch { /* new */ }

  // Add individual entries pointing to the bundle
  for (const articleId of Object.keys(bundle)) {
    registry[articleId] = {
      article_id: articleId,
      rootHash,  // all point to the same bundle
      txHash,
      submissionIndex,
      size: bundleBytes.length,
      uploadedAt: new Date().toISOString(),
      bundle: true,  // flag to indicate this is a bundle reference
    };
  }

  // Special __bundle key for the API to use directly
  registry.__bundle = {
    rootHash,
    txHash,
    submissionIndex,
    size: bundleBytes.length,
    entries: Object.keys(bundle).length,
    uploadedAt: new Date().toISOString(),
  };

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`\nRegistry:        ${REGISTRY_PATH} (${Object.keys(registry).length} entries)`);

  // Add to storage index for /og-storage page
  let storageIndex: any[] = [];
  try {
    storageIndex = JSON.parse(fs.readFileSync(STORAGE_INDEX_PATH, "utf-8"));
  } catch { /* empty */ }
  if (!storageIndex.some((e: any) => e.rootHash === rootHash)) {
    storageIndex.unshift({
      rootHash,
      txHash,
      submissionIndex,
      name: `rekt/all-analyses-bundle.json`,
      size: bundleBytes.length,
      wallet: walletAddr,
      timestamp: Date.now(),
      contentType: "application/json",
    });
    fs.writeFileSync(STORAGE_INDEX_PATH, JSON.stringify(storageIndex, null, 2));
  }
  console.log(`Storage index:   ${STORAGE_INDEX_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
