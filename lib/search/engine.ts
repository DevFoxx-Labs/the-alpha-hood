/**
 * In-process product search (SRCH-02) used by the mock adapter. A hosted engine (Algolia / Typesense /
 * Meilisearch or the platform search) replaces it behind `CommerceAdapter.searchCatalog`; the synonym
 * list below is the seed for that engine's synonym config.
 *
 * - normalises case, accents, hyphens ("T-Shirt" = "tshirt"), and simple plurals;
 * - synonyms incl. Hinglish ("tee" = "t-shirt", "pant" = "trouser", "lower" = "jogger", "chashma" = "sunglasses");
 * - typo tolerance: 1 edit for words of 4–7 letters, 2 edits for 8+ (Damerau-Levenshtein).
 */

/** Each group: canonical term first, then everything that should match it. */
export const SYNONYM_GROUPS: string[][] = [
  ["tshirt", "tee", "tees", "tshirts", "teeshirt", "tshrt", "baniyan"],
  ["trouser", "trousers", "pant", "pants", "pent", "chino", "chinos", "formalpant"],
  ["jogger", "joggers", "lower", "trackpant", "trackpants", "track", "sweatpant", "sweatpants"],
  ["jeans", "jean", "denim", "denims"],
  ["hoodie", "hoodies", "hoody", "sweatshirt", "sweatshirts"],
  ["sweater", "sweaters", "jumper", "pullover", "knitwear"],
  ["jacket", "jackets", "bomber", "puffer", "coat"],
  ["sunglasses", "sunglass", "shades", "chashma", "chasma", "goggles", "goggle"],
  ["sneaker", "sneakers", "shoes", "shoe", "joota", "juta", "kicks"],
  ["shirt", "shirts", "kameez"],
  ["cargo", "cargos", "utility"],
  ["oversized", "oversize", "baggy", "loose", "boxy"],
  ["cap", "caps", "topi", "hat"],
  ["kurta", "kurtas"],
  ["shorts", "short", "nikar", "bermuda"],
  ["polo", "polos", "collar"],
];

const SYNONYM_OF = new Map<string, string>();
for (const group of SYNONYM_GROUPS) for (const term of group) SYNONYM_OF.set(term, group[0]);

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\w)-(\w)/g, "$1$2") // t-shirt → tshirt, co-ord → coord
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bt shirts?\b/g, "tshirt")
    .replace(/\s+/g, " ")
    .trim();
}

/** Canonical form of one word: synonym root, else a light singular. */
export function canonical(word: string): string {
  const direct = SYNONYM_OF.get(word);
  if (direct) return direct;
  const singular = word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
  return SYNONYM_OF.get(singular) ?? singular;
}

export function tokens(text: string): string[] {
  return normalise(text)
    .split(" ")
    .filter((w) => w.length > 0)
    .map(canonical);
}

/** Optimal string alignment distance, bounded: returns max+1 as soon as it can't be ≤ max. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

function allowedEdits(word: string): number {
  if (word.length >= 8) return 2;
  if (word.length >= 4) return 1;
  return 0;
}

export interface SearchDoc {
  id: string;
  /** Weighted fields: title (3), category/sub (2), everything else (1). */
  title: string;
  category: string;
  extra: string;
}

interface IndexedDoc {
  id: string;
  fields: { words: Set<string>; weight: number }[];
}

export interface SearchIndex {
  docs: IndexedDoc[];
  vocabulary: string[];
}

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  const vocab = new Set<string>();
  const indexed = docs.map((doc) => {
    const fields = [
      { words: new Set(tokens(doc.title)), weight: 3 },
      { words: new Set(tokens(doc.category)), weight: 2 },
      { words: new Set(tokens(doc.extra)), weight: 1 },
    ];
    for (const f of fields) for (const w of f.words) vocab.add(w);
    return { id: doc.id, fields };
  });
  return { docs: indexed, vocabulary: [...vocab] };
}

/** Maps each query word to the vocabulary words it may match (exact, prefix for the last word, or fuzzy). */
function expand(word: string, vocabulary: string[], isLast: boolean): Map<string, number> {
  const matches = new Map<string, number>(); // vocab word → quality (1 exact, 0.8 prefix, 0.6 fuzzy)
  const max = allowedEdits(word);
  for (const v of vocabulary) {
    if (v === word) matches.set(v, 1);
    else if (isLast && word.length >= 2 && v.startsWith(word)) matches.set(v, 0.8);
    else if (max > 0 && editDistance(word, v, max) <= max) matches.set(v, 0.6);
  }
  // Typos of synonym terms ("baggi" → baggy → oversized), since the vocabulary only holds canonical forms.
  if (max > 0) {
    for (const [term, root] of SYNONYM_OF) {
      if (!matches.has(root) && editDistance(word, term, max) <= max) matches.set(root, 0.6);
    }
  }
  return matches;
}

/**
 * Returns doc ids with scores. Every query word must match at least one field (AND), so
 * "black baggy jeans" narrows instead of widening.
 */
export function search(index: SearchIndex, query: string): Map<string, number> {
  const words = [...new Set(tokens(query))].slice(0, 8);
  const scores = new Map<string, number>();
  if (words.length === 0) return scores;
  const expansions = words.map((w, i) => expand(w, index.vocabulary, i === words.length - 1));

  for (const doc of index.docs) {
    let total = 0;
    let all = true;
    for (const exp of expansions) {
      let best = 0;
      for (const f of doc.fields) {
        for (const [v, quality] of exp) if (f.words.has(v)) best = Math.max(best, quality * f.weight);
      }
      if (best === 0) {
        all = false;
        break;
      }
      total += best;
    }
    if (all) scores.set(doc.id, total);
  }
  return scores;
}
