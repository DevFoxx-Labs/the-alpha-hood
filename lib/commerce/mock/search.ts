import { ATTRIBUTE_VALUES, COLOUR_FAMILIES } from "@/lib/catalog/attributes";
import { buildIndex, search, type SearchIndex } from "@/lib/search/engine";
import { MOCK_CATEGORY_TREE, MOCK_PRODUCTS } from "./data";

/** Lazily built search index over the mock catalogue + category suggestions (SRCH-01/02). */
let cached: { index: SearchIndex; catIndex: SearchIndex; catHref: Map<string, { title: string; href: string }> } | null = null;

function build() {
  const index = buildIndex(
    MOCK_PRODUCTS.map((p) => {
      const cat = MOCK_CATEGORY_TREE.find((c) => c.handle === p.category);
      const sub = cat?.subcategories.find((s) => s.handle === p.subcategory);
      const attrs = Object.entries(p.attributes)
        .map(([k, v]) => (v ? ATTRIBUTE_VALUES[k as keyof typeof ATTRIBUTE_VALUES]?.[v] ?? v : ""))
        .join(" ");
      return {
        id: p.id,
        title: p.title,
        category: `${cat?.title ?? p.category} ${sub?.title ?? ""}`,
        extra: `${p.colour.name} ${COLOUR_FAMILIES[p.colourFamily]?.label ?? ""} ${attrs} ${p.tags.join(" ")}`,
      };
    }),
  );

  const catHref = new Map<string, { title: string; href: string }>();
  const catDocs = MOCK_CATEGORY_TREE.flatMap((c) => {
    catHref.set(c.handle, { title: c.title, href: `/men/${c.handle}` });
    return [
      { id: c.handle, title: c.title, category: c.handle.replace(/-/g, " "), extra: "" },
      ...c.subcategories.map((s) => {
        const id = `${c.handle}/${s.handle}`;
        catHref.set(id, { title: `${s.title} ${c.title.toLowerCase()}`, href: `/men/${id}` });
        return { id, title: `${s.title} ${c.title}`, category: c.title, extra: "" };
      }),
    ];
  });
  return { index, catIndex: buildIndex(catDocs), catHref };
}

export function searchIndex() {
  cached ??= build();
  const { index, catIndex, catHref } = cached;
  return {
    search: (q: string) => search(index, q),
    categories: (q: string) =>
      [...search(catIndex, q)]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([id]) => catHref.get(id)!),
  };
}
