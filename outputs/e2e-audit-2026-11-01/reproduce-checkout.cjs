// Read-only source reproduction. External I/O is replaced with explicit adapters.
// Run from repository root: node outputs/e2e-audit-2026-11-01/reproduce-checkout.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const ts = apiRequire('typescript');

function load(file, mocks = {}, baseRequire = apiRequire) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      esModuleInterop: true,
    },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : baseRequire(name),
    module,
    module.exports,
  );
  return module.exports;
}

async function main() {
  const enums = {
    OrderStatus: { PENDING: 'PENDING', PAID: 'PAID', PAYMENT_FAILED: 'PAYMENT_FAILED' },
    PaymentStatus: { PROCESSING: 'PROCESSING', SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED' },
  };
  const { PaymentsService } = load('apps/api/src/modules/payments/services/payments.service.ts', {
    '../../../generated/prisma/client.js': enums,
  });
  let orderStatus = 'PENDING';
  let charges = 0;
  const service = new PaymentsService(
    {
      findByIdempotencyKey: async () => null,
      createProcessingPayment: async () => ({ id: 'payment-1' }),
      markSucceeded: async () => {},
      markFailed: async () => {},
    },
    {
      getOrderForPayment: async () => ({ status: orderStatus, reservationExpiresAt: new Date(Date.now() + 60000) }),
      markOrderPaid: async () => { orderStatus = 'PAID'; },
      markOrderPaymentFailed: async () => { orderStatus = 'PAYMENT_FAILED'; },
    },
    { charge: async () => { charges++; return { success: true, gatewayTransactionId: 'gateway-1' }; } },
    { $transaction: async (callback) => callback({}) },
  );
  const params = { orderId: 'order-1', userId: 'user-1', amount: 40000n, method: 'CARD', idempotencyKey: 'key-1' };
  const response = await service.processPayment(params);
  assert.equal(response.status, 'SUCCEEDED');
  assert.equal(orderStatus, 'PAID');

  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  global.fetch = async () => new Response(JSON.stringify({ data: response }), { status: 200 });
  global.localStorage = { getItem: () => 'test-token' };
  try {
    const payments = load('apps/web/src/features/payments/api.ts', {}, webRequire);
    const React = webRequire('react');
    let error = null;
    let stateIndex = 0;
    let cleared = false;
    let redirected = null;
    const checkout = load('apps/web/src/app/checkout/page.tsx', {
      react: {
        ...React,
        useRef: (value) => ({ current: value }),
        useState: (value) => {
          const index = stateIndex++;
          return [value, (next) => { if (index === 2) error = next; }];
        },
      },
      'next/link': { __esModule: true, default: 'a' },
      'next/navigation': { useRouter: () => ({ replace: (url) => { redirected = url; } }) },
      '@/features/orders/api': { createOrderApi: async () => ({ id: 'order-1' }), OrdersApiError: class extends Error {} },
      '@/features/payments/api': payments,
      '@/stores/cart-store': {
        formatVnd: String,
        useCartStore: () => ({ items: [{ id: 'line-1', name: 'Coffee', size: 'M', quantity: 1, toppings: [], lineTotal: 40000 }], subtotal: 40000, totalQuantity: 1 }),
        cartStore: { getOrderItems: () => [], clearCart: () => { cleared = true; } },
      },
    }, webRequire);
    function findSubmit(element) {
      if (!element || typeof element !== 'object') return null;
      if (element.type === 'button' && element.props.disabled !== undefined) return element;
      for (const child of React.Children.toArray(element.props?.children)) {
        const found = findSubmit(child);
        if (found) return found;
      }
      return null;
    }
    const button = findSubmit(checkout.default());
    assert.ok(button, 'checkout submit button exists');
    await button.props.onClick();
    assert.ok(error, 'checkout displays failure for actual backend success response');
    assert.equal(cleared, false);
    assert.equal(redirected, null);
    console.log(JSON.stringify({ case: 'payment-success-contract', backendStatus: response.status, frontendPaymentStatus: response.paymentStatus ?? null, backendOrderStatus: orderStatus, cartCleared: cleared, redirected, displayedError: error }));
  } finally {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  }

  orderStatus = 'PAYMENT_FAILED';
  const previousCharges = charges;
  await assert.rejects(service.processPayment({ ...params, idempotencyKey: 'retry-key' }), (error) => {
    assert.equal(error.getResponse().code, 'ORDER_INVALID_TRANSITION');
    console.log(JSON.stringify({ case: 'retry-failed-order', responseCode: error.getResponse().code, gatewayInvoked: charges > previousCharges }));
    return true;
  });
  console.log('Both defects reproduced using current source with mocked external I/O. This is not live E2E.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
