import assert from 'node:assert/strict';
import { test } from 'node:test';

const input = {
  product: { id: 'product', sku: 'COFFEE', name: 'Coffee', imageUrl: '/coffee.png' },
  variantId: 'variant', size: 'M', unitPrice: 40000, quantity: 1,
  toppings: [{ id: 'pearl', name: 'Pearl', price: 5000 }],
};
const storageKey = 'brewlite_cart_storage';
let moduleId = 0;

async function setup(storedItems = []) {
  const values = new Map([[storageKey, JSON.stringify(storedItems)]]);
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const { cartStore } = await import(`../src/stores/cart-store.ts?test=${moduleId++}`);
  return { cartStore, read: () => JSON.parse(values.get(storageKey)) };
}

test('different sugar/ice preferences stay separate; identical options merge without changing price', async () => {
  const { cartStore, read } = await setup();
  cartStore.addItem({ ...input, sugarLevel: 0, iceLevel: 50 });
  cartStore.addItem({ ...input, sugarLevel: 100, iceLevel: 50 });
  cartStore.addItem({ ...input, sugarLevel: 0, iceLevel: 0 });
  cartStore.addItem({ ...input, sugarLevel: 0, iceLevel: 50 });
  assert.equal(read().length, 3);
  assert.equal(read()[0].quantity, 2);
  assert.equal(read()[0].lineTotal, 90000);
  assert.deepEqual(cartStore.getOrderItems()[0], {
    productVariantId: 'variant', quantity: 2, toppingIds: ['pearl'], sugarLevel: 0, iceLevel: 50,
  });
});

test('omitted and null preferences merge, while explicit 100% remains separate', async () => {
  const { cartStore, read } = await setup();
  cartStore.addItem(input);
  cartStore.addItem({ ...input, sugarLevel: null, iceLevel: null });
  cartStore.addItem({ ...input, sugarLevel: 100, iceLevel: 100 });
  assert.equal(read().length, 2);
  assert.equal(read()[0].quantity, 2);
  assert.equal(read()[0].sugarLevel, null);
  assert.equal(read()[0].iceLevel, null);
});

test('legacy carts retain quantities, migrate their identity and merge with new standard items', async () => {
  const legacy = {
    ...input, productId: 'product', id: 'product:variant:pearl',
    quantity: 2, name: 'Coffee', imageUrl: '/coffee.png', sku: 'COFFEE', lineTotal: 90000,
  };
  const { cartStore, read } = await setup([legacy]);
  cartStore.addItem(input);
  assert.equal(read().length, 1);
  assert.equal(read()[0].quantity, 3);
  assert.equal(read()[0].sugarLevel, null);
  assert.equal(read()[0].iceLevel, null);
});

test('reload preserves zero preferences and quantity updates/removal address the correct item', async () => {
  const first = await setup();
  first.cartStore.addItem({ ...input, sugarLevel: 0, iceLevel: 0 });
  first.cartStore.addItem({ ...input, sugarLevel: 50, iceLevel: 50 });
  const reloaded = await setup(first.read());
  assert.equal(reloaded.cartStore.getOrderItems()[0].sugarLevel, 0);
  assert.equal(reloaded.cartStore.getOrderItems()[0].iceLevel, 0);
  reloaded.cartStore.updateQuantity(first.read()[0].id, 3);
  assert.equal(reloaded.read()[0].quantity, 3);
  reloaded.cartStore.removeItem(first.read()[0].id);
  assert.equal(reloaded.read().length, 1);
  assert.equal(reloaded.read()[0].sugarLevel, 50);
});

test('topping order does not change cart identity', async () => {
  const { cartStore, read } = await setup();
  const toppings = [...input.toppings, { id: 'cream', name: 'Cream', price: 7000 }];
  cartStore.addItem({ ...input, toppings, sugarLevel: 25, iceLevel: 75 });
  cartStore.addItem({ ...input, toppings: [...toppings].reverse(), sugarLevel: 25, iceLevel: 75 });
  assert.equal(read().length, 1);
  assert.equal(read()[0].quantity, 2);
});
