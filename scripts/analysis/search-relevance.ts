/**
 * search-relevance.ts
 *
 * AI-powered search over relevance.jsonl using Qwen on 0G Network.
 * Given a transaction description, the model picks the top 10 most
 * relevant known attack patterns from the database.
 *
 * Usage:
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/analysis/search-relevance.ts "flash loan followed by a large borrow and immediate repay on Aave"
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/analysis/search-relevance.ts "someone is trying to swap 500 ETH for an unknown token through a proxy contract"
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/analysis/search-relevance.ts --json "bridge withdrawal of 10k ETH"
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/analysis/search-relevance.ts --top 5 "governance vote with huge token transfer in same block"
 */

import fs from "fs";
import { createRequire } from "module";
import path from "path";

const require = createRequire(
  path.resolve(__dirname, "../../frontend/package.json")
);

const { ethers } = require("ethers");
const { createZGComputeNetworkBroker } = require("@0glabs/0g-serving-broker");
const OpenAI = require("openai");

// ── Config ──────────────────────────────────────────────────────────

const OG_RPC = "https://evmrpc-testnet.0g.ai";
const RELEVANCE_PATH = path.resolve(__dirname, "relevance.json");
const RESULTS_DIR = path.resolve(__dirname, "results");
const TOP_N = 10;

// ── Types ───────────────────────────────────────────────────────────

interface RelevanceLine {
  score: number;
  id: string;
  vector: string;
  chain: string;
  funds: string;
  summary: string;
  triggers: string[];
  signatures: string[];
  red_flags: string[];
  addresses: string[];
}

interface RankedResult {
  rank: number;
  id: string;
  reason: string;
}

interface Provider {
  provider: string;
  endpoint: string;
  model: string;
}

// ── Load data ───────────────────────────────────────────────────────

function loadRelevance(): RelevanceLine[] {
  if (!fs.existsSync(RELEVANCE_PATH)) {
    console.error(`relevance.json not found at ${RELEVANCE_PATH}`);
    console.error("Run analyze-rekt.ts first to generate it.");
    process.exit(1);
  }

  return fs
    .readFileSync(RELEVANCE_PATH, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// ── 0G broker ───────────────────────────────────────────────────────

async function setupBroker() {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) {
    console.error("Set OG_PRIVATE_KEY env var");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(key, new ethers.JsonRpcProvider(OG_RPC));
  const broker = await createZGComputeNetworkBroker(wallet);

  try { await broker.ledger.getLedger(); } catch { await broker.ledger.addLedger(3); }

  return broker;
}

async function findProvider(broker: any): Promise<Provider> {
  const services = await broker.inference.listService();

  for (const svc of services) {
    if (svc.serviceType !== "chatbot") continue;
    try {
      const meta = await broker.inference.getServiceMetadata(svc.provider);
      if ((meta.model || "").toLowerCase().includes("qwen")) {
        return { provider: svc.provider, endpoint: meta.endpoint, model: meta.model };
      }
    } catch {}
  }

  for (const svc of services) {
    if (svc.serviceType !== "chatbot") continue;
    try {
      const meta = await broker.inference.getServiceMetadata(svc.provider);
      return { provider: svc.provider, endpoint: meta.endpoint, model: meta.model };
    } catch { continue; }
  }

  throw new Error("No chatbot provider available on 0G testnet");
}

// ── AI search ───────────────────────────────────────────────────────

async function aiSearch(
  broker: any,
  provider: Provider,
  entries: RelevanceLine[],
  query: string,
  topN: number
): Promise<RankedResult[]> {
  // Build a compact catalog for the model — one line per entry
  const catalog = entries
    .map(
      (e, i) =>
        `[${i}] id:${e.id} | vector:${e.vector} | chain:${e.chain} | funds:${e.funds} | summary:${e.summary} | triggers:${e.triggers.join("; ")} | red_flags:${e.red_flags.join("; ")} | signatures:${e.signatures.join("; ")}`
    )
    .join("\n");

  const systemPrompt = `You are the search engine for a DeFi transaction firewall. You have a database of ${entries.length} known attack patterns extracted from historical hack post-mortems. Given a description of a pending transaction or suspicious activity, you must pick the ${topN} entries from the database that are MOST relevant — patterns that this transaction could be an instance of, or that share the same attack vector/technique.

Think about:
- Does the transaction match the attack vector (flash loan, reentrancy, oracle manipulation, etc.)?
- Do the triggers or signatures overlap with what the transaction is doing?
- Could the red flags from that hack apply to this transaction?
- Is it the same chain or protocol type?

Reply with ONLY valid JSON. No markdown fences, no extra text.

{
  "results": [
    { "rank": 1, "id": "<article_id>", "reason": "<1 sentence: why this pattern is relevant to the transaction>" },
    ...
  ]
}`;

  const userPrompt = `TRANSACTION TO CHECK:\n${query}\n\nDATABASE (${entries.length} entries):\n${catalog}`;

  const headers = await broker.inference.getRequestHeaders(provider.provider, userPrompt);

  const openai = new (OpenAI.default || OpenAI)({
    baseURL: provider.endpoint,
    apiKey: "",
  });

  const completion = await openai.chat.completions.create(
    {
      model: provider.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    },
    { headers }
  );

  const raw: string = completion.choices[0].message.content || "";
  const chatId: string = completion.id;

  // Verify + settle
  try { await broker.inference.processResponse(provider.provider, chatId, raw); } catch {}

  // Parse
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Model returned non-JSON: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]);
  return (parsed.results || []).slice(0, topN);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const topIdx = args.indexOf("--top");
  const topN = topIdx !== -1 && args[topIdx + 1] ? parseInt(args[topIdx + 1], 10) : TOP_N;
  const query = args.filter((a) => !a.startsWith("--") && !(topIdx !== -1 && a === args[topIdx + 1])).join(" ").trim();

  const entries = loadRelevance();

  if (!query) {
    // No query — just dump top N by score, no AI needed
    if (jsonOutput) {
      console.log(JSON.stringify(entries.slice(0, topN), null, 2));
      return;
    }
    console.log(`\nTop ${Math.min(topN, entries.length)} by relevance score (${entries.length} total):\n`);
    for (const e of entries.slice(0, topN)) {
      console.log(`  ${e.score}/10  ${e.id}`);
      console.log(`         ${e.vector} | ${e.chain} | ${e.funds}`);
      console.log(`         ${e.summary}`);
      if (e.triggers.length) console.log(`         triggers: ${e.triggers.join(", ")}`);
      console.log();
    }
    return;
  }

  // AI search
  console.error(`Searching ${entries.length} entries via 0G inference...\n`);

  const broker = await setupBroker();
  const provider = await findProvider(broker);
  console.error(`Model: ${provider.model}\n`);

  try { await broker.inference.acknowledgeProviderSigner(provider.provider); } catch {}
  try { await broker.ledger.transferFund(provider.provider, "inference", ethers.parseEther("0.5")); } catch {}

  const ranked = await aiSearch(broker, provider, entries, query, topN);

  // Enrich with full data from relevance entries
  const enriched = ranked.map((r) => {
    const entry = entries.find((e) => e.id === r.id);
    return { ...r, entry };
  });

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        enriched.map((r) => ({
          rank: r.rank,
          id: r.id,
          reason: r.reason,
          ...(r.entry || {}),
          result_file: `results/${r.id}.json`,
        })),
        null,
        2
      )
    );
    return;
  }

  console.log(`Top ${enriched.length} matches for: "${query}"\n`);

  for (const r of enriched) {
    const e = r.entry;
    console.log(`  #${r.rank}  ${r.id}`);
    if (e) {
      console.log(`       [${e.score}/10] ${e.vector} | ${e.chain} | ${e.funds}`);
      console.log(`       ${e.summary}`);
      if (e.triggers.length) console.log(`       triggers: ${e.triggers.join(", ")}`);
    }
    console.log(`       reason: ${r.reason}`);
    console.log(`       full: results/${r.id}.json`);
    console.log();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
