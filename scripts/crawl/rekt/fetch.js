const fs = require("fs");
const path = require("path");

const CR_KEY = process.env.CR_KEY;
const OUT_DIR = path.join(__dirname, "articles");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const DELAY_MS = 1000;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArticleContent(html) {
  const articleMatch =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    html.match(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  const bodyHtml = articleMatch ? articleMatch[1] : html;

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(bodyHtml)) !== null) {
    const text = stripHtml(m[1]);
    if (text.length > 0) paragraphs.push(text);
  }

  const headings = [];
  const hRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  while ((m = hRegex.exec(bodyHtml)) !== null) {
    const text = stripHtml(m[1]);
    if (text.length > 0) headings.push(text);
  }

  return { headings, paragraphs, fullText: stripHtml(bodyHtml) };
}

async function crawlArticle(url) {
  const apiUrl = `https://api.crawlbase.com/?token=${CR_KEY}&url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`Crawlbase returned ${res.status}`);
  return res.text();
}

async function main() {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  console.log(`${index.articles.length} articles in index\n`);

  // Figure out which ones still need fetching
  const toFetch = index.articles.filter((a) => {
    const filePath = path.join(OUT_DIR, `${a.id}.json`);
    return !fs.existsSync(filePath);
  });

  console.log(`${toFetch.length} articles to fetch (${index.articles.length - toFetch.length} already done)\n`);

  for (let i = 0; i < toFetch.length; i++) {
    const article = toFetch[i];
    try {
      process.stdout.write(`[${i + 1}/${toFetch.length}] ${article.id}...`);

      const html = await crawlArticle(article.url);
      const content = extractArticleContent(html);

      const result = {
        id: article.id,
        title: article.title,
        date: article.date,
        excerpt: article.excerpt,
        url: article.url,
        crawledAt: new Date().toISOString(),
        headings: content.headings,
        paragraphs: content.paragraphs,
        fullText: content.fullText,
      };

      const outPath = path.join(OUT_DIR, `${article.id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(` ${content.paragraphs.length} paragraphs`);

      if (i < toFetch.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    } catch (err) {
      console.error(` ERROR: ${err.message}`);
    }
  }

  console.log(`\nDone!`);
}

main();
