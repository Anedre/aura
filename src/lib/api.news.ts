// src/lib/api.news.ts
type CryptoCompareArticle = {
  id: string;
  guid?: string;
  published_on?: number;
  imageurl?: string;
  url?: string;
  source?: string;
  body?: string;
  title?: string;
  categories?: string;
  tags?: string;
  lang?: string;
};

type NewsApiArticle = {
  title?: string;
  url?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
  source?: { name?: string };
};

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  summary?: string;
  source?: string;
  publishedAt?: string;
  sentiment?: string;
  symbols?: string[];
  imageUrl?: string;
}

const NEWS_API_KEY = process.env.NEXT_PUBLIC_NEWS_API_KEY?.trim() || null;
const NEWS_API_BASE = "https://newsapi.org/v2";
const CRYPTOCOMPARE_ENDPOINT = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";

export interface SymbolNewsOptions {
  limit?: number;
  name?: string | null;
  extraTerms?: string[];
}

const DEFAULT_LIMIT = 6;

function normalizeText(value: string | undefined | null): string {
  return typeof value === "string" ? value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase() : "";
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  if (!text || keywords.length === 0) return false;
  const haystack = normalizeText(text);
  return keywords.some((keyword) => {
    const clean = normalizeText(keyword);
    return clean.length > 1 && haystack.includes(clean);
  });
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const result: NewsItem[] = [];
  for (const item of items) {
    const key = item.url.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

async function fetchCryptoCompare(limit: number): Promise<NewsItem[]> {
  const response = await fetch(CRYPTOCOMPARE_ENDPOINT, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`CryptoCompare request failed (${response.status})`);
  }
  const json = (await response.json()) as { Data?: CryptoCompareArticle[] };
  const rows = Array.isArray(json.Data) ? json.Data : [];
  return rows
    .map<NewsItem | null>((row) => {
      if (!row || typeof row !== "object") return null;
      const title = row.title?.trim();
      const url = row.url?.trim();
      if (!title || !url) return null;
      const published = row.published_on ? new Date(row.published_on * 1000).toISOString() : undefined;
      return {
        id: row.id || row.guid || url,
        title,
        url,
        summary: row.body?.trim(),
        source: row.source?.trim(),
        publishedAt: published,
        symbols: row.categories?.split("|").map((c) => c.trim()).filter(Boolean),
        imageUrl: row.imageurl?.trim(),
      };
    })
    .filter((item): item is NewsItem => !!item)
    .slice(0, limit);
}

async function fetchNewsApiEverything(query: string, limit: number): Promise<NewsItem[]> {
  const pageSize = Math.min(Math.max(limit, 10), 50);
  const params = new URLSearchParams({
    q: query,
    language: "es",
    sortBy: "publishedAt",
    pageSize: String(pageSize),
  });
  const response = await fetch(`${NEWS_API_BASE}/everything?${params.toString()}`, {
    headers: {
      "X-Api-Key": NEWS_API_KEY ?? "",
    },
  });
  if (!response.ok) {
    throw new Error(`NewsAPI everything failed (${response.status})`);
  }
  const json = (await response.json()) as { articles?: NewsApiArticle[] };
  const rows = Array.isArray(json.articles) ? json.articles : [];
  return rows
    .map<NewsItem | null>((row, idx) => {
      const title = row.title?.trim();
      const url = row.url?.trim();
      if (!title || !url) return null;
      return {
        id: `${url}-${idx}`,
        title,
        url,
        summary: row.description?.trim() || row.content?.trim(),
        source: row.source?.name?.trim(),
        publishedAt: row.publishedAt,
      };
    })
    .filter((item): item is NewsItem => !!item);
}

async function fetchNewsApiTop(limit: number): Promise<NewsItem[]> {
  const pageSize = Math.min(Math.max(limit, 5), 20);
  const params = new URLSearchParams({
    category: "business",
    language: "es",
    pageSize: String(pageSize),
  });
  const response = await fetch(`${NEWS_API_BASE}/top-headlines?${params.toString()}`, {
    headers: {
      "X-Api-Key": NEWS_API_KEY ?? "",
    },
  });
  if (!response.ok) {
    throw new Error(`NewsAPI headlines failed (${response.status})`);
  }
  const json = (await response.json()) as { articles?: NewsApiArticle[] };
  const rows = Array.isArray(json.articles) ? json.articles : [];
  return rows
    .map<NewsItem | null>((row, idx) => {
      const title = row.title?.trim();
      const url = row.url?.trim();
      if (!title || !url) return null;
      return {
        id: `${url}-${idx}`,
        title,
        url,
        summary: row.description?.trim() || row.content?.trim(),
        source: row.source?.name?.trim(),
        publishedAt: row.publishedAt,
      };
    })
    .filter((item): item is NewsItem => !!item)
    .slice(0, limit);
}

function ensureKeywords(symbol: string, options?: SymbolNewsOptions): string[] {
  const list = new Set<string>();
  list.add(symbol);
  if (options?.name) list.add(options.name);
  options?.extraTerms?.forEach((value) => {
    if (value) list.add(value);
  });
  return Array.from(list).filter((value) => value.trim().length > 0);
}

export async function fetchSymbolNews(symbol: string, options?: SymbolNewsOptions): Promise<NewsItem[]> {
  if (!symbol) return [];
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const keywords = ensureKeywords(symbol, options);
  try {
    let articles: NewsItem[];
    if (NEWS_API_KEY) {
      const query = keywords.map((keyword) => `"${keyword}"`).join(" OR ") || symbol;
      articles = await fetchNewsApiEverything(query, limit * 2);
    } else {
      articles = await fetchCryptoCompare(limit * 4);
    }
    const filtered = keywords.length
      ? articles.filter((article) => matchesKeywords(`${article.title} ${article.summary ?? ""}`, keywords))
      : articles;
    const pick = filtered.length > 0 ? filtered : articles;
    return dedupeNews(pick).slice(0, limit);
  } catch (err) {
    console.warn("[news] symbol fetch failed, returning empty list", err);
    return [];
  }
}

export async function fetchTopNews(limit = DEFAULT_LIMIT): Promise<NewsItem[]> {
  try {
    if (NEWS_API_KEY) {
      return await fetchNewsApiTop(limit);
    }
    return await fetchCryptoCompare(limit);
  } catch (err) {
    console.warn("[news] top fetch failed", err);
    return [];
  }
}
