import { toOrderItemResponse } from './order-item.mapper.js';

describe('toOrderItemResponse', () => {
  it.each([
    [0, 100],
    [null, null],
  ])(
    'returns persisted preferences %s/%s and snapshot prices',
    (sugarLevel, iceLevel) => {
      const response = toOrderItemResponse({
        id: 'item',
        orderId: 'order',
        productVariantId: 'variant',
        productNameSnapshot: 'Coffee',
        variantNameSnapshot: 'M',
        unitPrice: 40000n,
        quantity: 2,
        sugarLevel,
        iceLevel,
        note: sugarLevel === null ? null : 'Để topping riêng',
        orderItemToppings: [
          {
            id: 'item-topping',
            orderItemId: 'item',
            toppingId: 'topping',
            toppingNameSnapshot: 'Pearl',
            unitPrice: 5000n,
            quantity: 1,
          },
        ],
      });
      expect(response).toMatchObject({
        sugarLevel,
        iceLevel,
        note: sugarLevel === null ? null : 'Để topping riêng',
        productName: 'Coffee',
        lineTotal: 90000,
      });
      expect(() => JSON.stringify(response)).not.toThrow();
    },
  );
});
