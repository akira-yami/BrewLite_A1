'use client';

import { useSyncExternalStore } from 'react';
import type { Product, ProductSize, Topping } from '@/features/catalog/types';
import type { CreateOrderItemInput } from '@/features/orders/types';

export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  imageUrl: string;
  size: ProductSize;
  unitPrice: number;
  quantity: number;
  sugarLevel: number | null;
  iceLevel: number | null;
  toppings: Array<Pick<Topping, 'id' | 'name' | 'price'>>;
  lineTotal: number;
}

interface AddCartItemInput {
  product: Product;
  variantId: string;
  size: ProductSize;
  unitPrice: number;
  quantity: number;
  sugarLevel?: number | null;
  iceLevel?: number | null;
  toppings: Array<Pick<Topping, 'id' | 'name' | 'price'>>;
}

interface CartSnapshot {
  items: CartItem[];
  totalQuantity: number;
  subtotal: number;
}

const STORAGE_KEY = 'brewlite_cart_storage';
const emptySnapshot: CartSnapshot = {
  items: [],
  totalQuantity: 0,
  subtotal: 0,
};

let currentSnapshot = emptySnapshot;
let hydrated = false;
const listeners = new Set<() => void>();

function normalizeLevel(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function formatCartItemId(input: Pick<CartItem, 'productId' | 'variantId' | 'toppings' | 'sugarLevel' | 'iceLevel'>) {
  const toppingKey = input.toppings
    .map((topping) => topping.id)
    .sort()
    .join('.');

  return `${input.productId}:${input.variantId}:${toppingKey || 'plain'}:sugar=${input.sugarLevel ?? 'standard'}:ice=${input.iceLevel ?? 'standard'}`;
}

function calculateSnapshot(items: CartItem[]): CartSnapshot {
  const normalizedItems = items.map((item) => {
    const sugarLevel = normalizeLevel(item.sugarLevel);
    const iceLevel = normalizeLevel(item.iceLevel);
    const toppingsTotal = item.toppings.reduce((sum, topping) => sum + topping.price, 0);
    const lineTotal = (item.unitPrice + toppingsTotal) * item.quantity;

    return {
      ...item,
      id: formatCartItemId({ ...item, sugarLevel, iceLevel }),
      sugarLevel,
      iceLevel,
      lineTotal,
    };
  });

  return {
    items: normalizedItems,
    totalQuantity: normalizedItems.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0),
  };
}

function emit(nextItems: CartItem[]) {
  currentSnapshot = calculateSnapshot(nextItems);

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSnapshot.items));
  }

  listeners.forEach((listener) => listener());
}

function hydrateCart() {
  if (hydrated || typeof window === 'undefined') return;

  hydrated = true;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const parsed = JSON.parse(stored) as CartItem[];
    if (!Array.isArray(parsed)) return;

    currentSnapshot = calculateSnapshot(
      parsed.filter((item) => item && item.id && item.productId && item.quantity > 0),
    );
  } catch {
    currentSnapshot = emptySnapshot;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  hydrateCart();

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  hydrateCart();
  return currentSnapshot;
}

function getServerSnapshot() {
  return emptySnapshot;
}

export function useCartStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const cartStore = {
  getOrderItems(): CreateOrderItemInput[] {
    hydrateCart();
    return currentSnapshot.items.map((item) => ({
      productVariantId: item.variantId,
      quantity: item.quantity,
      toppingIds: item.toppings.map((topping) => topping.id),
      sugarLevel: item.sugarLevel,
      iceLevel: item.iceLevel,
    }));
  },

  addItem(input: AddCartItemInput) {
    hydrateCart();
    const sugarLevel = normalizeLevel(input.sugarLevel);
    const iceLevel = normalizeLevel(input.iceLevel);
    const id = formatCartItemId({ ...input, productId: input.product.id, sugarLevel, iceLevel });
    const existing = currentSnapshot.items.find((item) => item.id === id);

    if (existing) {
      emit(
        currentSnapshot.items.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + input.quantity } : item,
        ),
      );
      return;
    }

    const toppingsTotal = input.toppings.reduce((sum, topping) => sum + topping.price, 0);
    const nextItem: CartItem = {
      id,
      productId: input.product.id,
      variantId: input.variantId,
      sku: input.product.sku,
      name: input.product.name,
      imageUrl: input.product.imageUrl,
      size: input.size,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
      sugarLevel,
      iceLevel,
      toppings: input.toppings,
      lineTotal: (input.unitPrice + toppingsTotal) * input.quantity,
    };

    emit([...currentSnapshot.items, nextItem]);
  },

  updateQuantity(id: string, quantity: number) {
    hydrateCart();
    if (quantity <= 0) {
      this.removeItem(id);
      return;
    }

    emit(
      currentSnapshot.items.map((item) =>
        item.id === id ? { ...item, quantity } : item,
      ),
    );
  },

  removeItem(id: string) {
    hydrateCart();
    emit(currentSnapshot.items.filter((item) => item.id !== id));
  },

  clearCart() {
    hydrateCart();
    emit([]);
  },
};

export function formatVnd(value: number) {
  return `${value.toLocaleString('vi-VN')} đ`;
}
