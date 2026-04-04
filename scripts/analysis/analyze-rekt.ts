/**
 * analyze-rekt.ts
 *
 * Feeds rekt.news hack articles through Qwen 2.5-7B on 0G Network
 * to extract actionable signals for real-time transaction monitoring.
 *
 * Idempotent — skips articles that already have a result in results/.
 * Writes index.json after every article so progress is never lost.
 *
 * Usage:
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/analysis/analyze-rekt.ts
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/analysis/analyze-rekt.ts --all
 *   OG_PRIVATE_KEY=<key> npx tsx scripts/analysis/analyze-rekt.ts --reindex  # rebuild index from results/
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

// ── Types ───────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  url: string;
  fullText: string;
  paragraphs: string[];
}

interface Prevention {
  rule: string;        // e.g. "Block flash loan > $1M followed by donateToReserves call"
  trigger: string;     // on-chain condition that fires the rule
  severity: "critical" | "high" | "medium" | "low";
}

interface AnalysisResult {
  article_id: string;
  title: string;
  relevance_score: number;
  relevance_summary: string;
  attack_vector: string;
  funds_lost: string;
  chain: string;
  prevention: Prevention[];
  on_chain_signatures: string[];
  red_flags: string[];
  attacker_addresses: string[];
  vulnerable_contracts: string[];
  monitoring_rules: string[];
  summary: string;
}

interface AnalysisMeta {
  chatId: string;
  verified: boolean | null;
  model: string;
  provider: string;
  analyzedAt: string;
}

type StoredResult = AnalysisResult & { _meta: AnalysisMeta };

interface IndexEntry {
  article_id: string;
  title: string;
  relevance_score: number;
  relevance_summary: string;
  attack_vector: string;
  chain: string;
  funds_lost: string;
  prevention: Prevention[];
}

interface IndexFile {
  generatedAt: string;
  model: string;
  count: number;
  articles: IndexEntry[];
}

// ── Config ──────────────────────────────────────────────────────────

const OG_RPC = "https://evmrpc-testnet.0g.ai";
const TARGET_MODEL = "qwen/qwen-2.5-7b-instruct";
const CONCURRENCY = 15;
const ARTICLES_DIR = path.resolve(__dirname, "../crawl/rekt/articles");
const OUTPUT_DIR = path.resolve(__dirname, "results");
const INDEX_PATH = path.resolve(__dirname, "index.json");
const RELEVANCE_PATH = path.resolve(__dirname, "relevance.json");

// Keywords in article text that indicate non-EVM
const NON_EVM_KEYWORDS = [
  "solana", "sol program", "wormhole.*solana", "anchor framework",
  "spl token", "terra luna", "cosmwasm", "near protocol",
  "move language", "aptos", "sui network", "cardano",
];

// 5 high-signal EVM hack articles for test run
const TEST_ARTICLES = [
  "ronin-rekt",       // bridge validator compromise, $624M
  "euler-rekt",       // flash loan + donateToReserves, $197M
  "curve-vyper-rekt", // reentrancy via Vyper compiler bug
  "bybit-rekt",       // exchange hot wallet drain
  "beanstalk-rekt",   // governance flash loan attack
];

// ── Helpers ─────────────────────────────────────────────────────────

function isNonEVM(article: Article): boolean {
  const text = (article.fullText + " " + article.title + " " + article.excerpt).toLowerCase();

  for (const kw of NON_EVM_KEYWORDS) {
    if (new RegExp(kw, "i").test(text)) {
      const evmMentions = (text.match(/ethereum|evm|erc-?20|solidity|etherscan/gi) || []).length;
      const nonEvmMentions = (text.match(new RegExp(kw, "gi")) || []).length;
      if (nonEvmMentions > evmMentions && evmMentions < 3) {
        return true;
      }
    }
  }

  return false;
}

/** Check if an article already has a result on disk */
function alreadyDone(articleId: string): boolean {
  return fs.existsSync(path.join(OUTPUT_DIR, `${articleId}.json`));
}

/** Load an existing result from disk */
function loadResult(articleId: string): StoredResult | null {
  const p = path.join(OUTPUT_DIR, `${articleId}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// ── Relevance line (JSONL) ──────────────────────────────────────────

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

function toRelevanceLine(r: AnalysisResult | StoredResult): RelevanceLine {
  return {
    score: r.relevance_score,
    id: r.article_id,
    vector: r.attack_vector,
    chain: r.chain,
    funds: r.funds_lost,
    summary: r.relevance_summary,
    triggers: (r.prevention || []).map((p) => p.trigger),
    signatures: r.on_chain_signatures || [],
    red_flags: r.red_flags || [],
    addresses: r.attacker_addresses || [],
  };
}

/** Rebuild relevance.jsonl from every result file — one line per article, sorted by score desc */
function rebuildRelevanceFile() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  const lines: RelevanceLine[] = [];

  for (const file of files) {
    try {
      const r: StoredResult = JSON.parse(
        fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8")
      );
      lines.push(toRelevanceLine(r));
    } catch {}
  }

  lines.sort((a, b) => b.score - a.score);
  fs.writeFileSync(
    RELEVANCE_PATH,
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n"
  );

  return lines.length;
}

/** Append one result to relevance.jsonl (or rebuild if missing) */
function appendToRelevanceFile(result: AnalysisResult) {
  if (!fs.existsSync(RELEVANCE_PATH)) {
    rebuildRelevanceFile();
    return;
  }

  // Read existing, remove dupe, append, re-sort, write
  const existing = fs
    .readFileSync(RELEVANCE_PATH, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RelevanceLine)
    .filter((l) => l.id !== result.article_id);

  existing.push(toRelevanceLine(result));
  existing.sort((a, b) => b.score - a.score);

  fs.writeFileSync(
    RELEVANCE_PATH,
    existing.map((l) => JSON.stringify(l)).join("\n") + "\n"
  );
}

// ── Index (JSON) ────────────────────────────────────────────────────

/** Rebuild index.json + relevance.jsonl from every result file in results/ */
function rebuildIndex(model: string): IndexFile {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  const entries: IndexEntry[] = [];

  for (const file of files) {
    try {
      const r: StoredResult = JSON.parse(
        fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8")
      );
      entries.push({
        article_id: r.article_id,
        title: r.title,
        relevance_score: r.relevance_score,
        relevance_summary: r.relevance_summary,
        attack_vector: r.attack_vector,
        chain: r.chain,
        funds_lost: r.funds_lost,
        prevention: r.prevention,
      });
    } catch {
      // skip corrupt files
    }
  }

  entries.sort((a, b) => b.relevance_score - a.relevance_score);

  const index: IndexFile = {
    generatedAt: new Date().toISOString(),
    model,
    count: entries.length,
    articles: entries,
  };

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  rebuildRelevanceFile();
  return index;
}

/** Append a single result to the index + relevance file */
function appendToIndex(result: AnalysisResult, model: string) {
  // -- index.json
  let index: IndexFile;

  if (fs.existsSync(INDEX_PATH)) {
    try {
      index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
    } catch {
      index = rebuildIndex(model);
      return;
    }
  } else {
    index = { generatedAt: new Date().toISOString(), model, count: 0, articles: [] };
  }

  index.articles = index.articles.filter((a) => a.article_id !== result.article_id);

  index.articles.push({
    article_id: result.article_id,
    title: result.title,
    relevance_score: result.relevance_score,
    relevance_summary: result.relevance_summary,
    attack_vector: result.attack_vector,
    chain: result.chain,
    funds_lost: result.funds_lost,
    prevention: result.prevention,
  });

  index.articles.sort((a, b) => b.relevance_score - a.relevance_score);
  index.generatedAt = new Date().toISOString();
  index.count = index.articles.length;

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

  // -- relevance.jsonl
  appendToRelevanceFile(result);
}

// ── 0G Broker Setup ─────────────────────────────────────────────────

async function setupBroker() {
  const key = process.env.OG_PRIVATE_KEY;
  if (!key) {
    console.error("Set OG_PRIVATE_KEY env var (hex private key for 0G testnet)");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(key, new ethers.JsonRpcProvider(OG_RPC));
  console.log(`Wallet: ${wallet.address}`);

  const broker = await createZGComputeNetworkBroker(wallet);

  try {
    await broker.ledger.getLedger();
    console.log("Ledger found");
  } catch {
    console.log("Creating ledger...");
    await broker.ledger.addLedger(3);
  }

  return broker;
}

// ── Find provider running target model ──────────────────────────────

interface Provider {
  provider: string;
  endpoint: string;
  model: string;
}

async function findProvider(broker: any): Promise<Provider> {
  const services = await broker.inference.listService();
  console.log(`Found ${services.length} services on 0G network`);

  // Try to find qwen specifically
  for (const svc of services) {
    if (svc.serviceType !== "chatbot") continue;
    try {
      const meta = await broker.inference.getServiceMetadata(svc.provider);
      const modelLower = (meta.model || "").toLowerCase();
      if (modelLower.includes("qwen")) {
        console.log(`Matched provider ${svc.provider} -> model: ${meta.model}`);
        return { provider: svc.provider, endpoint: meta.endpoint, model: meta.model };
      }
    } catch {
      // skip unreachable
    }
  }

  // Fallback: first available chatbot
  for (const svc of services) {
    if (svc.serviceType !== "chatbot") continue;
    try {
      const meta = await broker.inference.getServiceMetadata(svc.provider);
      console.log(`No Qwen found — falling back to ${meta.model} @ ${svc.provider}`);
      return { provider: svc.provider, endpoint: meta.endpoint, model: meta.model };
    } catch {
      continue;
    }
  }

  throw new Error("No chatbot provider available on 0G testnet");
}

// ── Analyze a single article ────────────────────────────────────────

const SYSTEM_PROMPT = `You are a DeFi security analyst building a real-time EVM transaction monitoring system (a Safe Guard module). Extract actionable intelligence from hack post-mortems that could help an on-chain guard detect and BLOCK malicious transactions BEFORE they execute.

Reply with ONLY valid JSON. No markdown fences, no extra text.

{
  "article_id": "<id>",
  "title": "<title>",
  "relevance_score": <0-10>,
  "relevance_summary": "<SHORT one-line searchable summary describing what kind of transaction to watch for, e.g. 'Flash loan followed by donateToReserves on lending protocol' or 'Governance proposal with flash-loaned votes on DAO' or 'Bridge withdrawal with compromised validator signatures'>",
  "attack_vector": "<type: flash_loan | reentrancy | oracle_manipulation | bridge_exploit | access_control | governance_attack | price_manipulation | signature_bypass | compiler_bug | other>",
  "funds_lost": "<amount in USD>",
  "chain": "<ethereum | bsc | polygon | arbitrum | optimism | avalanche | fantom | multi-chain | other>",
  "prevention": [
    {
      "rule": "<concrete blocking rule, e.g. 'Block any tx that calls donateToReserves() after a flash loan borrow in the same tx'>",
      "trigger": "<on-chain condition, e.g. 'FLASHLOAN_BORROW -> donateToReserves() in single tx'>",
      "severity": "<critical | high | medium | low>"
    }
  ],
  "on_chain_signatures": ["<function selector or call pattern>"],
  "red_flags": ["<observable behavior>"],
  "attacker_addresses": ["<0x...>"],
  "vulnerable_contracts": ["<protocol or 0x...>"],
  "monitoring_rules": ["<rule>"],
  "summary": "<1-2 sentences: what happened and how a guard could have stopped it>"
}`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const FAILED_DIR = path.resolve(__dirname, "failed");

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip JS-style comments from a JSON string */
function stripComments(s: string): string {
  // Remove // comments to end of line, but keep everything before them on that line
  return s
    .split("\n")
    .map((line) => {
      // Don't strip // inside quoted strings — find the comment outside of strings
      let inString = false;
      let escape = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (!inString && ch === "/" && line[i + 1] === "/") {
          // Found a comment — strip from here, but keep trailing comma if present
          let before = line.slice(0, i).trimEnd();
          // If the line before the comment ends with a comma, keep it
          return before;
        }
      }
      return line;
    })
    .join("\n")
    // Clean up trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, "$1");
}

/** Try hard to extract JSON from model output */
function extractJSON(raw: string): AnalysisResult | null {
  // 1. Strip markdown fences: ```json ... ``` or ``` ... ```
  let cleaned = raw
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();

  // 2. Strip JS comments (the #1 reason Qwen output fails to parse)
  cleaned = stripComments(cleaned);

  // 3. Try parsing the whole cleaned string directly
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.article_id) return parsed;
  } catch {}

  // 4. Extract outermost { ... } block
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      const parsed = JSON.parse(braceMatch[0]);
      if (parsed.article_id) return parsed;
    } catch {}

    // 5. Try fixing remaining issues: trailing commas, single quotes
    try {
      const fixed = braceMatch[0]
        .replace(/,\s*([}\]])/g, "$1")   // trailing commas
        .replace(/'/g, '"');              // single quotes
      const parsed = JSON.parse(fixed);
      if (parsed.article_id) return parsed;
    } catch {}
  }

  return null;
}

/** Log a failed raw response for debugging */
function logFailed(articleId: string, raw: string) {
  fs.mkdirSync(FAILED_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FAILED_DIR, `${articleId}.txt`),
    raw
  );
}

/** Single inference call to the model */
async function callModel(
  broker: any,
  provider: Provider,
  messages: { role: string; content: string }[]
): Promise<{ raw: string; chatId: string; verified: boolean | null }> {
  const lastMsg = messages[messages.length - 1].content;
  const headers = await broker.inference.getRequestHeaders(provider.provider, lastMsg);

  const openai = new (OpenAI.default || OpenAI)({
    baseURL: provider.endpoint,
    apiKey: "",
  });

  const completion = await openai.chat.completions.create(
    { model: provider.model, messages, temperature: 0.2 },
    { headers }
  );

  const raw: string = completion.choices[0].message.content || "";
  const chatId: string = completion.id;

  let verified: boolean | null = null;
  try {
    verified = await broker.inference.processResponse(provider.provider, chatId, raw);
  } catch {}

  return { raw, chatId, verified };
}

async function analyzeWithRetry(
  broker: any,
  provider: Provider,
  article: Article
): Promise<{ raw: string; parsed: AnalysisResult | null; chatId: string; verified: boolean | null }> {
  const excerpt =
    article.fullText.length > 3000
      ? article.fullText.slice(0, 3000) + "..."
      : article.fullText;

  const userPrompt = `Analyze this DeFi hack article:\n\nTitle: ${article.title}\nDate: ${article.date}\nID: ${article.id}\n\n${excerpt}`;

  let lastRaw = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const messages: { role: string; content: string }[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ];

      // On retry attempts after a parse failure, add a fix-up message
      if (attempt > 1 && lastRaw) {
        messages.push(
          { role: "assistant", content: lastRaw },
          { role: "user", content: "Your response was not valid JSON. Reply with ONLY the raw JSON object, no markdown fences (```), no explanation, no text before or after. Just the { ... } object." }
        );
      }

      const result = await callModel(broker, provider, messages);
      const parsed = extractJSON(result.raw);

      if (parsed) {
        // Ensure article_id is correct
        parsed.article_id = article.id;
        return { raw: result.raw, parsed, chatId: result.chatId, verified: result.verified };
      }

      // Parse failed — save raw for next attempt's fix-up prompt
      lastRaw = result.raw;

      if (attempt < MAX_RETRIES) {
        process.stdout.write(`(parse retry ${attempt}/${MAX_RETRIES}) `);
        await sleep(RETRY_DELAY_MS);
      }
    } catch (err: any) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        process.stdout.write(`(error retry ${attempt}/${MAX_RETRIES} in ${delay}ms) `);
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }

  // All retries exhausted — log the last raw response for debugging
  logFailed(article.id, lastRaw);
  return { raw: lastRaw, parsed: null, chatId: "", verified: null };
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const runAll = process.argv.includes("--all");
  const reindexOnly = process.argv.includes("--reindex");

  console.log("=========================================================");
  console.log("  0G x Rekt Article Analyzer — DeFi Hack Intelligence");
  console.log("  Model: " + TARGET_MODEL);
  console.log("  Filter: EVM-only | Idempotent: yes");
  console.log("=========================================================\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // --reindex: just rebuild index + relevance from existing results and exit
  if (reindexOnly) {
    const index = rebuildIndex(TARGET_MODEL);
    console.log(`Rebuilt index with ${index.count} articles`);
    console.log(`  ${INDEX_PATH}`);
    console.log(`  ${RELEVANCE_PATH}\n`);
    return;
  }

  // 1. Load & filter articles
  let articleIds: string[];
  if (runAll) {
    articleIds = fs
      .readdirSync(ARTICLES_DIR)
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .map((f) => f.replace(".json", ""));
  } else {
    articleIds = TEST_ARTICLES;
  }

  const articles: Article[] = [];
  let skippedNonEvm = 0;
  let skippedDone = 0;

  for (const id of articleIds) {
    const filePath = path.join(ARTICLES_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`  skip: ${id} (file not found)`);
      continue;
    }

    // Idempotent: skip if already analyzed
    if (alreadyDone(id)) {
      skippedDone++;
      continue;
    }

    const article: Article = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (isNonEVM(article)) {
      console.log(`  skip: ${id} (non-EVM)`);
      skippedNonEvm++;
      continue;
    }

    articles.push(article);
  }

  console.log(
    `\n${articles.length} to analyze | ${skippedDone} already done | ${skippedNonEvm} non-EVM skipped\n`
  );

  if (articles.length === 0) {
    console.log("Nothing to do — all articles already analyzed.");
    // Rebuild index from existing results to make sure it's current
    const index = rebuildIndex(TARGET_MODEL);
    console.log(`Index has ${index.count} articles -> ${INDEX_PATH}\n`);
    return;
  }

  // 2. Setup 0G broker
  const broker = await setupBroker();
  const provider = await findProvider(broker);
  console.log(`Endpoint: ${provider.endpoint}`);
  console.log(`Model: ${provider.model}\n`);

  try { await broker.inference.acknowledgeProviderSigner(provider.provider); } catch {}
  try { await broker.ledger.transferFund(provider.provider, "inference", ethers.parseEther("1")); } catch {}

  // 3. Analyze — 8x parallel, write each result + update index as we go
  let analyzed = 0;
  let errored = 0;
  let completed = 0;

  async function processOne(article: Article) {
    const idx = ++completed;
    const tag = `[${idx}/${articles.length}] ${article.id}`;

    try {
      const result = await analyzeWithRetry(broker, provider, article);

      if (result.parsed) {
        analyzed++;
        console.log(
          `${tag} -> score: ${result.parsed.relevance_score}/10 | ${result.parsed.attack_vector} | verified: ${result.verified}`
        );

        // Write result to disk immediately
        const outPath = path.join(OUTPUT_DIR, `${article.id}.json`);
        const fullOutput: StoredResult = {
          ...result.parsed,
          _meta: {
            chatId: result.chatId,
            verified: result.verified,
            model: provider.model,
            provider: provider.provider,
            analyzedAt: new Date().toISOString(),
          },
        };
        fs.writeFileSync(outPath, JSON.stringify(fullOutput, null, 2));

        // Update index immediately so it's always current
        appendToIndex(result.parsed, provider.model);
      } else {
        errored++;
        console.log(`${tag} -> FAILED (see failed/${article.id}.txt)`);
      }
    } catch (err: any) {
      errored++;
      console.log(`${tag} -> ERROR after ${MAX_RETRIES} attempts: ${err.message}`);
    }
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < articles.length; i += CONCURRENCY) {
    const batch = articles.slice(i, i + CONCURRENCY);
    console.log(`\n--- batch ${Math.floor(i / CONCURRENCY) + 1} (${batch.length} articles) ---`);
    await Promise.all(batch.map(processOne));
  }

  // 4. Final index rebuild to make sure everything is consistent
  const index = rebuildIndex(provider.model);

  // 5. Print summary
  console.log("\n=========================================================");
  console.log("  ANALYSIS COMPLETE");
  console.log("=========================================================");
  console.log(`  New: ${analyzed} | Errors: ${errored} | Previously done: ${skippedDone}`);
  console.log(`  Total in index: ${index.count}`);
  console.log(`  Results:    ${OUTPUT_DIR}/`);
  console.log(`  Index:      ${INDEX_PATH}`);
  console.log(`  Relevance:  ${RELEVANCE_PATH}`);

  const high = index.articles.filter((r) => r.relevance_score >= 7);
  if (high.length > 0) {
    console.log(`\n  HIGH RELEVANCE (${high.length}):\n`);
    for (const r of high) {
      console.log(`  [${r.relevance_score}/10] ${r.article_id}`);
      console.log(`    ${r.relevance_summary}`);
      if (r.prevention?.length) {
        for (const p of r.prevention) {
          console.log(`    [${p.severity}] ${p.rule}`);
        }
      }
      console.log();
    }
  }

  console.log("  Run again to resume if interrupted — already-done articles are skipped.");
  console.log("  Use --reindex to rebuild index + relevance from existing results.");
  console.log("  Use: OG_PRIVATE_KEY=... npx tsx scripts/analysis/search-relevance.ts \"flash loan swap\"\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
