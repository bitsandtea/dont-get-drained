import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ARTICLES_DIR = path.join(process.cwd(), "..", "scripts", "crawl", "rekt", "articles");
const ANALYSIS_DIR = path.join(process.cwd(), "..", "scripts", "analysis", "results");
const INDEX_PATH = path.join(ARTICLES_DIR, "index.json");

// GET /api/rekt                        → compact index [{id, title, excerpt}, ...]
// GET /api/rekt?ids=a,b,c              → analysis results for those IDs, sorted by relevance_score
// GET /api/rekt?ids=a,b,c&limit=5      → return only top N results
export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get("ids");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 0) : 0;

  if (!ids) {
    // Return triage index from analysis results — compact for AI triage
    // Use ?compact=1 (default) for minimal fields, ?compact=0 for full index entries
    // Use ?limit=N to cap the number of entries returned
    const compact = req.nextUrl.searchParams.get("compact") !== "0";
    try {
      const files = fs.readdirSync(ANALYSIS_DIR).filter((f) => f.endsWith(".json"));
      let index = files.map((f) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(ANALYSIS_DIR, f), "utf-8"));
          if (compact) {
            // Minimal JSON for AI triage — keeps total index under model context limits
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
      }).filter(Boolean);
      // Default cap at 100 entries for compact mode to fit model context windows
      // Use ?limit=N to override, ?compact=0 for full entries
      const indexLimit = limit || (compact ? 100 : 0);
      if (indexLimit) index = index.slice(0, indexLimit);
      return NextResponse.json(index);
    } catch {
      return NextResponse.json({ error: "Analysis results not found" }, { status: 404 });
    }
  }

  // Return articles by IDs — accepts comma-separated or JSON array
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

  // Return analysis results sorted by relevance_score (highest first)
  // Only essential fields — keeps response small enough for AI inference prompts
  const results: any[] = [];

  for (const id of idList) {
    if (!/^[\w-]+$/.test(id)) continue;
    const filePath = path.join(ANALYSIS_DIR, `${id}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
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
    } catch {
      // skip missing — analysis may not exist for every article
    }
  }

  results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

  // Default limit of 10 for analysis results
  const effectiveLimit = limit || 10;
  return NextResponse.json(results.slice(0, effectiveLimit));
}
