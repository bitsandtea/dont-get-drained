import fs from "fs";
import path from "path";

const INDEX_PATH = path.join(process.cwd(), "storage-index.json");

export interface StorageEntry {
  rootHash: string;
  txHash: string;
  submissionIndex: number | null;
  name: string;
  size: number;
  wallet: string;
  timestamp: number;
  contentType: string;
}

function readIndex(): StorageEntry[] {
  try {
    const raw = fs.readFileSync(INDEX_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeIndex(entries: StorageEntry[]) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2));
}

export function listEntries(wallet?: string): StorageEntry[] {
  const all = readIndex();
  if (!wallet) return all;
  return all.filter(
    (e) => e.wallet.toLowerCase() === wallet.toLowerCase()
  );
}

export function addEntry(entry: StorageEntry) {
  const entries = readIndex();
  // Don't duplicate
  if (entries.some((e) => e.rootHash === entry.rootHash)) return;
  entries.unshift(entry);
  writeIndex(entries);
}

export function getEntry(rootHash: string): StorageEntry | undefined {
  return readIndex().find((e) => e.rootHash === rootHash);
}
