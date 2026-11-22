"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { PublicCartView } from "@/lib/cart/service";
import type { Product } from "@/lib/commerce/types";
import { showBagToast, showMessageToast } from "./toast";

/**
 * Client UI state for the shell: menu drawer, bag drawer, the server cart (CART-01/04/05) and the wishlist.
 * The bag lives on the server (HttpOnly `ah_cart` cookie); every change goes through /api/cart/* and the
 * server returns the re-validated, re-priced bag. Nothing here is trusted for money.
 */
export type BagLine = PublicCartView["lines"][number];

interface StoreUI {
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  cart: PublicCartView | null;
  lines: BagLine[];
  itemCount: number;
  cartBusy: boolean;
  refreshCart: () => Promise<void>;
  addToBag: (product: Product, size: string) => Promise<boolean>;
  updateLine: (lineId: string, input: { size?: string; quantity?: number }) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<{ ok: boolean; message?: string }>;
  removeCoupon: () => Promise<void>;
  wishlist: ReadonlySet<string>;
  toggleWishlist: (productId: string) => void;
}

const StoreUIContext = createContext<StoreUI | null>(null);

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: unknown; status: number }> {
  const res = await fetch(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data, status: res.status };
}

function errorMessage(data: unknown, fallback: string): string {
  const message = (data as { error?: { message?: string } } | null)?.error?.message;
  return typeof message === "string" && message.length < 200 ? message : fallback;
}

export function StoreUIProvider({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpenState] = useState(false);
  const [cart, setCart] = useState<PublicCartView | null>(null);
  const [cartBusy, setCartBusy] = useState(false);
  const [wishlist, setWishlist] = useState<ReadonlySet<string>>(() => new Set());
  const loaded = useRef(false);

  const refreshCart = useCallback(async () => {
    try {
      const r = await send("/api/cart", "GET");
      if (r.ok) setCart(r.data as PublicCartView);
    } catch {
      // Offline / server down: keep the last known bag.
    }
  }, []);

  // CART-05: re-validate whenever the bag is opened.
  const setCartOpen = useCallback(
    (open: boolean) => {
      if (open) {
        toast.dismiss();
        void refreshCart();
      }
      setCartOpenState(open);
    },
    [refreshCart],
  );

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void refreshCart();
  }, [refreshCart]);

  const mutate = useCallback(async (url: string, method: string, body: unknown, failure: string) => {
    setCartBusy(true);
    try {
      const r = await send(url, method, body);
      if (r.ok) {
        setCart(r.data as PublicCartView);
        return { ok: true as const };
      }
      const message = errorMessage(r.data, failure);
      if (r.status === 404) void refreshCart();
      return { ok: false as const, message };
    } catch {
      return { ok: false as const, message: "You seem to be offline. Please try again." };
    } finally {
      setCartBusy(false);
    }
  }, [refreshCart]);

  const addToBag = useCallback(
    async (product: Product, size: string) => {
      const r = await mutate("/api/cart/lines", "POST", { productId: product.id, size, quantity: 1 }, "Couldn't add to bag.");
      if (!r.ok) {
        showMessageToast(r.message);
        return false;
      }
      showBagToast({ title: product.title, size, image: product.images[0] }, () => setCartOpen(true));
      return true;
    },
    [mutate, setCartOpen],
  );

  const updateLine = useCallback(
    async (lineId: string, input: { size?: string; quantity?: number }) => {
      const r = await mutate(`/api/cart/lines/${encodeURIComponent(lineId)}`, "PATCH", input, "Couldn't update your bag.");
      if (!r.ok) showMessageToast(r.message);
    },
    [mutate],
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      const r = await mutate(`/api/cart/lines/${encodeURIComponent(lineId)}`, "DELETE", {}, "Couldn't remove the item.");
      if (!r.ok) showMessageToast(r.message);
    },
    [mutate],
  );

  const applyCoupon = useCallback((code: string) => mutate("/api/cart/coupon", "POST", { code }, "This coupon can't be used."), [mutate]);

  const removeCoupon = useCallback(async () => {
    await mutate("/api/cart/coupon", "DELETE", {}, "Couldn't remove the coupon.");
  }, [mutate]);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const lines = useMemo(() => cart?.lines ?? [], [cart]);
  const value = useMemo<StoreUI>(
    () => ({
      menuOpen,
      setMenuOpen,
      cartOpen,
      setCartOpen,
      cart,
      lines,
      itemCount: lines.reduce((n, l) => n + (l.status === "unavailable" ? 0 : l.quantity), 0),
      cartBusy,
      refreshCart,
      addToBag,
      updateLine,
      removeLine,
      applyCoupon,
      removeCoupon,
      wishlist,
      toggleWishlist,
    }),
    [menuOpen, cartOpen, setCartOpen, cart, lines, cartBusy, refreshCart, addToBag, updateLine, removeLine, applyCoupon, removeCoupon, wishlist, toggleWishlist],
  );

  return <StoreUIContext.Provider value={value}>{children}</StoreUIContext.Provider>;
}

export function useStoreUI() {
  const ctx = useContext(StoreUIContext);
  if (!ctx) throw new Error("useStoreUI must be used inside <StoreUIProvider>");
  return ctx;
}
