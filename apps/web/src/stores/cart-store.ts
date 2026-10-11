'use client';

import { useSyncExternalStore } from 'react';
import { Product, ProductSize, Topping } from '@/features/catalog/types';

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
  toppings: Array<Pick<Topping, 'id' | 'name' | 'price'>>;
  lineTotal: number;
}

export interface AddCartItemInput {
  product: Product;
  variantId: string;
  size: ProductSize;
  unitPrice: number;
  quantity: number;
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

function formatCartItemId(input: AddCartItemInput) {
  const toppingKey = input.toppings
    .map((topping) => topping.id)
    .sort()
    .join('.');

  return `${input.product.id}:${input.variantId}:${toppingKey || 'plain'}`;
}

function calculateSnapshot(items: CartItem[]): CartSnapshot {
  const normalizedItems = items.map((item) => {
    const toppingsTotal = item.toppings.reduce((sum, topping) => sum + topping.price, 0);
    const lineTotal = (item.unitPrice + toppingsTotal) * item.quantity;

    return {
      ...item,
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
  addItem(input: AddCartItemInput) {
    const id = formatCartItemId(input);
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
      toppings: input.toppings,
      lineTotal: (input.unitPrice + toppingsTotal) * input.quantity,
    };

    emit([...currentSnapshot.items, nextItem]);
  },

  replaceItem(idToReplace: string, input: AddCartItemInput) {
    const nextId = formatCartItemId(input);
    const toppingsTotal = input.toppings.reduce((sum, topping) => sum + topping.price, 0);
    const replacement: CartItem = {
      id: nextId,
      productId: input.product.id,
      variantId: input.variantId,
      sku: input.product.sku,
      name: input.product.name,
      imageUrl: input.product.imageUrl,
      size: input.size,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
      toppings: input.toppings,
      lineTotal: (input.unitPrice + toppingsTotal) * input.quantity,
    };

    const withoutOriginal = currentSnapshot.items.filter((item) => item.id !== idToReplace);
    const sameConfiguration = withoutOriginal.find((item) => item.id === nextId);

    if (sameConfiguration) {
      emit(
        withoutOriginal.map((item) =>
          item.id === nextId
            ? { ...item, quantity: item.quantity + replacement.quantity }
            : item,
        ),
      );
      return;
    }

    emit([...withoutOriginal, replacement]);
  },

  updateQuantity(id: string, quantity: number) {
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
    emit(currentSnapshot.items.filter((item) => item.id !== id));
  },

  clearCart() {
    emit([]);
  },
};

export function formatVnd(value: number) {
  return `${value.toLocaleString('vi-VN')} đ`;
}
