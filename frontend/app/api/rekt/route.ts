import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { fetchFrom0G } from "@/lib/og-inference";

const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(process.cwd(), "..");
const ANALYSIS_DIR = path.join(PROJECT_ROOT, "scripts", "analysis", "results");
const REGISTRY_PATH = path.join(PROJECT_ROOT, "scripts", "analysis", "0g-registry.json");

// In-memory cache: article_id → parsed analysis JSON
const cache = new Map<string, any>();
let bundleLoaded = false;

// Deduplication: only one inflight bundle fetch at a time
let bundlePromise: Promise<boolean> | null = null;

// Load the 0G bundle registry
type Registry = Record<string, any>;
let registry: Registry = {};
let registryLoadedAt = 0;

function getRegistry(): Registry {
  if (Date.now() - registryLoadedAt > 60_000) {
    try {
      registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
      registryLoadedAt = Date.now();
    } catch { /* no registry yet */ }
  }
  return registry;
}

// Load entire bundle from 0G into cache (one network call for all entries)
// Deduplicates concurrent calls — only one download at a time
function loadBundle(): Promise<boolean> {
  if (bundleLoaded) return Promise.resolve(true);
  if (bundlePromise) return bundlePromise;

  bundlePromise = (async () => {
    const reg = getRegistry();
    const bundleInfo = reg.__bundle;
    if (!bundleInfo?.rootHash) return false;

    try {
      console.log(`[rekt] Loading bundle from 0G: ${bundleInfo.rootHash.slice(0, 20)}...`);
      const text = await fetchFrom0G(bundleInfo.rootHash);
      const bundle = JSON.parse(text);

      // Integrity check: verify we got a reasonable object
      const keys = Object.keys(bundle);
      if (keys.length === 0) {
        console.warn(`[rekt] Bundle is empty, falling back to fs`);
        return false;
      }
      if (bundleInfo.entries && keys.length < bundleInfo.entries * 0.9) {
        console.warn(`[rekt] Bundle has ${keys.length} entries, expected ~${bundleInfo.entries} — possible corruption`);
      }

      for (const [id, data] of Object.entries(bundle)) {
        cache.set(id, data);
      }
      bundleLoaded = true;
      console.log(`[rekt] Bundle loaded: ${cache.size} entries cached from 0G`);
      return true;
    } catch (err) {
      console.warn(`[rekt] Bundle load failed, falling back to fs: ${err instanceof Error ? err.message : err}`);
      return false;
    } finally {
      bundlePromise = null;
    }
  })();

  return bundlePromise;
}

// Fetch a single analysis: cache → 0G bundle → filesystem fallback
async function fetchAnalysis(articleId: string): Promise<any | null> {
  const cached = cache.get(articleId);
  if (cached) return cached;

  // Try loading the full bundle first (one fetch for everything)
  await loadBundle();
  const afterBundle = cache.get(articleId);
  if (afterBundle) return afterBundle;

  // Filesystem fallback
  try {
    const filePath = path.join(ANALYSIS_DIR, `${articleId}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    cache.set(articleId, data);
    return data;
  } catch {
    return null;
  }
}

// GET /api/rekt                        → compact index [{id, title, excerpt}, ...]
// GET /api/rekt?ids=a,b,c              → analysis results for those IDs, sorted by relevance_score
// GET /api/rekt?ids=a,b,c&limit=5      → return only top N results
// GET /api/rekt?source=info            → show data source stats
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 0) : 0;

  // Source info endpoint
  if (req.nextUrl.searchParams.get("source") === "info") {
    const reg = getRegistry();
    const bundleInfo = reg.__bundle;
    return NextResponse.json({
      bundle_root: bundleInfo?.rootHash?.slice(0, 20) || null,
      bundle_entries: bundleInfo?.entries || 0,
      cached: cache.size,
      bundle_loaded: bundleLoaded,
    });
  }

  if (!ids) {
    // Return triage index — load all analyses
    const compact = req.nextUrl.searchParams.get("compact") !== "0";
    try {
      // Try loading from 0G bundle first
      await loadBundle();

      // Get list of all article IDs (from cache if bundle loaded, else filesystem)
      let articleIds: string[];
      if (bundleLoaded && cache.size > 0) {
        articleIds = Array.from(cache.keys());
      } else {
        const allFiles = fs.readdirSync(ANALYSIS_DIR).filter((f) => f.endsWith(".json"));
        articleIds = allFiles.map((f) => f.replace(".json", ""));
      }

      const results = await Promise.all(
        articleIds.map(async (id) => {
          try {
            const data = await fetchAnalysis(id);
            if (!data) return null;
            if (compact) {
              return {
                id: data.article_id,
                attack_vector: data.attack_vector,
                chain: data.chain,
                relevance_summary: (data.relevance_summary || "").slice(0, 60),
              };
            }
            return {
              id: data.article_id,
              title: data.title,
              attack_vector: data.attack_vector,
              chain: data.chain,
              funds_lost: data.funds_lost,
              relevance_summary: data.relevance_summary,
              red_flags: data.red_flags,
              on_chain_signatures: data.on_chain_signatures,
            };
          } catch {
            return null;
          }
        })
      );

      let index = results.filter(Boolean);
      const indexLimit = limit || (compact ? 100 : 0);
      if (indexLimit) index = index.slice(0, indexLimit);
      return NextResponse.json(index);
    } catch {
      return NextResponse.json({ error: "Analysis results not found" }, { status: 404 });
    }
  }

  // Return articles by IDs
  let idList: string[];
  try {
    const parsed = JSON.parse(ids);
    idList = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    idList = ids.split(",").map((s) => s.trim().replace(/["\[\]]/g, "")).filter(Boolean);
  }
  if (idList.length === 0) {
    return NextResponse.json([]);
  }
  if (idList.length > 50) {
    return NextResponse.json({ error: "Max 50 articles per request" }, { status: 400 });
  }

  const results: any[] = [];
  const fetched = await Promise.all(
    idList
      .filter((id) => /^[\w-]+$/.test(id))
      .map((id) => fetchAnalysis(id))
  );

  for (const data of fetched) {
    if (!data) continue;
    results.push({
      article_id: data.article_id,
      title: data.title,
      relevance_score: data.relevance_score,
      attack_vector: data.attack_vector,
      chain: data.chain,
      funds_lost: data.funds_lost,
      red_flags: data.red_flags,
      prevention: data.prevention,
      on_chain_signatures: data.on_chain_signatures,
    });
  }

  results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

  const effectiveLimit = limit || 10;
  return NextResponse.json(results.slice(0, effectiveLimit));
}
