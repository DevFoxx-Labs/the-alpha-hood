"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CartLine, Product } from "@/lib/commerce/types";
import { STORE_CONFIG } from "@/lib/config/store";
import { showBagToast } from "./toast";

/**
 * Client UI state for the shell: menu drawer, mini-cart drawer, an optimistic bag and wishlist.
 *
 * M1 scope: the bag here is display state only, so the design system can be exercised.
 * M5 (CART-04/05) replaces it with the server cart via `lib/commerce` — prices and stock are
 * re-validated on the server there; nothing in this state is ever trusted for money.
 */
interface StoreUI {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  lines: CartLine[];
  itemCount: number;
  addToBag: (product: Product, size: string) => void;
  updateLine: (lineId: string, input: { size?: string; quantity?: number }) => void;
  removeLine: (lineId: string) => void;
  wishlist: ReadonlySet<string>;
  toggleWishlist: (productId: string) => void;
}

const StoreUIContext = createContext<StoreUI | null>(null);

export function StoreUIProvider({
  children,
  initialLines = [],
}: {
  children: React.ReactNode;
  initialLines?: CartLine[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpenState] = useState(false);
  // The bag drawer shows the same information as the "Added to bag" toast — never stack them.
  const setCartOpen = useCallback((open: boolean) => {
    if (open) toast.dismiss();
    setCartOpenState(open);
  }, []);
  const [lines, setLines] = useState<CartLine[]>(initialLines);
  const [wishlist, setWishlist] = useState<ReadonlySet<string>>(() => new Set());

  const addToBag = useCallback(
    (product: Product, size: string) => {
      const existing = lines.find((l) => l.productId === product.id && l.size === size);
      if (existing) {
        setLines(
          lines.map((l) =>
            l === existing ? { ...l, quantity: Math.min(STORE_CONFIG.maxQtyPerSku, l.quantity + 1) } : l,
          ),
        );
        showBagToast(existing, () => setCartOpen(true));
        return;
      }
      const added: CartLine = {
        id: `local_${product.id}_${size}`.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        productId: product.id,
        title: product.title,
        colour: product.colour.name,
        size,
        quantity: 1,
        price: product.price,
        mrp: product.mrp,
        image: product.images[0],
      };
      setLines([...lines, added]);
      showBagToast(added, () => setCartOpen(true));
    },
    [lines, setCartOpen],
  );

  const updateLine = useCallback((lineId: string, input: { size?: string; quantity?: number }) => {
    setLines((current) =>
      current.map((l) =>
        l.id === lineId
          ? {
              ...l,
              size: input.size ?? l.size,
              quantity: Math.min(STORE_CONFIG.maxQtyPerSku, Math.max(1, input.quantity ?? l.quantity)),
            }
          : l,
      ),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((current) => current.filter((l) => l.id !== lineId));
  }, []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const value = useMemo<StoreUI>(
    () => ({
      menuOpen,
      setMenuOpen,
      cartOpen,
      setCartOpen,
      lines,
      itemCount: lines.reduce((n, l) => n + l.quantity, 0),
      addToBag,
      updateLine,
      removeLine,
      wishlist,
      toggleWishlist,
    }),
    [menuOpen, cartOpen, setCartOpen, lines, addToBag, updateLine, removeLine, wishlist, toggleWishlist],
  );

  return <StoreUIContext.Provider value={value}>{children}</StoreUIContext.Provider>;
}

export function useStoreUI() {
  const ctx = useContext(StoreUIContext);
  if (!ctx) throw new Error("useStoreUI must be used inside <StoreUIProvider>");
  return ctx;
}
