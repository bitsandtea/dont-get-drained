const fs = require("fs");
const path = require("path");

const CR_JS_KEY = process.env.CR_JS_KEY;
const BASE_URL = "https://rekt.news/";
const OUT_DIR = path.join(__dirname, "articles");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const DELAY_MS = 3000;

// rekt.news is 0-indexed: page 0 = first page, page 41 = last
const START_PAGE = parseInt(process.argv[2] || "0", 10);
const END_PAGE = parseInt(process.argv[3] || "41", 10);

function loadIndex() {
  if (fs.existsSync(INDEX_PATH)) {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  }
  return { crawledAt: null, totalArticles: 0, articles: [] };
}

function saveIndex(index) {
  index.crawledAt = new Date().toISOString();
  index.totalArticles = index.articles.length;
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

function extractArticles(html) {
  const articles = [];
  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/i);
    const linkMatch = block.match(/href="([^"]*?)"/i);
    const dateMatch = block.match(/<time[^>]*>([\s\S]*?)<\/time>/i) ||
      block.match(/(\d{1,2}\s+\w+\s+\d{4})/);
    const excerptMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, "").trim()
      : null;
    const slug = linkMatch
      ? linkMatch[1].replace(/^\//, "").replace(/\/$/, "")
      : null;
    const date = dateMatch
      ? dateMatch[1].replace(/<[^>]+>/g, "").trim()
      : null;
    const excerpt = excerptMatch
      ? excerptMatch[1].replace(/<[^>]+>/g, "").trim()
      : null;

    if (title && slug) {
      articles.push({
        id: slug,
        title,
        url: `https://rekt.news/${slug}/`,
        date,
        excerpt,
      });
    }
  }

  return articles;
}

async function crawlPage(pageNum) {
  const targetUrl = pageNum === 0 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;
  const apiUrl = `https://api.crawlbase.com/?token=${CR_JS_KEY}&url=${encodeURIComponent(targetUrl)}&page_wait=3000`;

  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`Crawlbase returned ${res.status}`);
  return res.text();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const index = loadIndex();
  const existingIds = new Set(index.articles.map((a) => a.id));

  console.log(
    `Indexing pages ${START_PAGE}-${END_PAGE} (${existingIds.size} articles already indexed)\n`
  );

  for (let page = START_PAGE; page <= END_PAGE; page++) {
    try {
      process.stdout.write(`Page ${page}/${END_PAGE}...`);
      const html = await crawlPage(page);
      const articles = extractArticles(html);

      let added = 0;
      for (const article of articles) {
        if (!existingIds.has(article.id)) {
          index.articles.push(article);
          existingIds.add(article.id);
          added++;
        }
      }

      // Save after every page so progress is never lost
      saveIndex(index);
      console.log(` ${articles.length} found, ${added} new (total: ${index.articles.length})`);

      if (page < END_PAGE) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    } catch (err) {
      console.error(` ERROR: ${err.message}`);
    }
  }

  console.log(`\nDone! ${index.articles.length} articles indexed in index.json`);
}

main();
