/**
 * clean-relevance.ts
 *
 * Cleans up the analysis database:
 *  - Deletes result files for entries with no useful data (no summary, triggers, or red flags)
 *  - Strips entries with score <= 3 from relevance.json (result files kept, just not in the fast index)
 *  - Rebuilds relevance.json and index.json
 *
 * Usage:
 *   npx tsx scripts/analysis/clean-relevance.ts           # dry run
 *   npx tsx scripts/analysis/clean-relevance.ts --apply    # actually delete + rebuild
 *   npx tsx scripts/analysis/clean-relevance.ts --cutoff 5 # custom score cutoff (default 3)
 */

import fs from "fs";
import path from "path";

const RESULTS_DIR = path.resolve(__dirname, "results");
const RELEVANCE_PATH = path.resolve(__dirname, "relevance.json");
const INDEX_PATH = path.resolve(__dirname, "index.json");

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

function main() {
  const apply = process.argv.includes("--apply");
  const cutoffIdx = process.argv.indexOf("--cutoff");
  const cutoff = cutoffIdx !== -1 && process.argv[cutoffIdx + 1]
    ? parseInt(process.argv[cutoffIdx + 1], 10)
    : 3;

  if (!fs.existsSync(RELEVANCE_PATH)) {
    console.error("relevance.json not found. Run analyze-rekt.ts first.");
    process.exit(1);
  }

  const lines: RelevanceLine[] = fs
    .readFileSync(RELEVANCE_PATH, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  console.log(`Total entries: ${lines.length}`);
  console.log(`Score cutoff: <= ${cutoff}\n`);

  // Categorize
  const empty: RelevanceLine[] = [];
  const lowScore: RelevanceLine[] = [];
  const keep: RelevanceLine[] = [];

  for (const e of lines) {
    const hasSummary = e.summary && e.summary.trim().length > 5;
    const hasTriggers = e.triggers && e.triggers.length > 0 && e.triggers[0]?.length > 0;
    const hasRedFlags = e.red_flags && e.red_flags.length > 0 && e.red_flags[0]?.length > 0;

    if (!hasSummary && !hasTriggers && !hasRedFlags) {
      empty.push(e);
    } else if (e.score <= cutoff) {
      lowScore.push(e);
    } else {
      keep.push(e);
    }
  }

  console.log(`Empty (no useful data):    ${empty.length} -> DELETE result files + remove from index`);
  console.log(`Low score (<= ${cutoff}):          ${lowScore.length} -> remove from relevance (result files kept)`);
  console.log(`Keep:                      ${keep.length}\n`);

  if (empty.length > 0) {
    console.log("Empty entries to delete:");
    for (const e of empty) console.log(`  - ${e.id}`);
    console.log();
  }

  if (lowScore.length > 0) {
    console.log(`Low score entries to strip (top 10 of ${lowScore.length}):`);
    for (const e of lowScore.slice(0, 10)) console.log(`  - ${e.id} (score: ${e.score})`);
    if (lowScore.length > 10) console.log(`  ... and ${lowScore.length - 10} more`);
    console.log();
  }

  if (!apply) {
    console.log("DRY RUN — pass --apply to execute.\n");
    return;
  }

  // Delete empty result files
  let deleted = 0;
  for (const e of empty) {
    const p = path.join(RESULTS_DIR, `${e.id}.json`);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      deleted++;
    }
  }
  console.log(`Deleted ${deleted} empty result files.`);

  // Rebuild relevance.json with only kept entries
  keep.sort((a, b) => b.score - a.score);
  fs.writeFileSync(
    RELEVANCE_PATH,
    keep.map((l) => JSON.stringify(l)).join("\n") + "\n"
  );
  console.log(`Wrote ${keep.length} entries to relevance.json`);

  // Rebuild index.json from remaining result files
  const resultFiles = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
  const indexEntries: any[] = [];

  for (const file of resultFiles) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8"));
      indexEntries.push({
        article_id: r.article_id,
        title: r.title,
        relevance_score: r.relevance_score,
        relevance_summary: r.relevance_summary,
        attack_vector: r.attack_vector,
        chain: r.chain,
        funds_lost: r.funds_lost,
        prevention: r.prevention,
      });
    } catch {}
  }

  indexEntries.sort((a: any, b: any) => b.relevance_score - a.relevance_score);
  fs.writeFileSync(INDEX_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: "qwen/qwen-2.5-7b-instruct",
    count: indexEntries.length,
    articles: indexEntries,
  }, null, 2));

  console.log(`Rebuilt index.json with ${indexEntries.length} entries.`);
  console.log(`\nDone. relevance.json: ${keep.length} entries (was ${lines.length})\n`);
}

main();
