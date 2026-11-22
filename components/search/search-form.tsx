import { Search01Icon } from "@hugeicons/core-free-icons";
import Form from "next/form";
import { Icon } from "@/components/ui/icon";
import { MAX_QUERY_LENGTH } from "@/lib/catalog/query";
import { cn } from "@/lib/utils";

/** Plain GET form to /search (works without JS; next/form navigates client-side when it can). */
export function SearchForm({ defaultValue, className }: { defaultValue?: string; className?: string }) {
  return (
    <Form action="/search" role="search" className={cn("flex border border-black", className)}>
      <label htmlFor="search-page-q" className="sr-only">
        Search products
      </label>
      <input
        id="search-page-q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        maxLength={MAX_QUERY_LENGTH}
        placeholder="Search tees, jeans, hoodies…"
        className="h-12 min-w-0 flex-1 bg-white px-4 text-[14px] outline-none"
      />
      <button type="submit" aria-label="Search" className="grid w-12 place-items-center bg-black text-white">
        <Icon icon={Search01Icon} size={20} />
      </button>
    </Form>
  );
}
