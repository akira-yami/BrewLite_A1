import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto.js';

const item = {
  productVariantId: '123e4567-e89b-42d3-a456-426614174000',
  quantity: 1,
};
const check = (options: Record<string, unknown>) =>
  validate(
    plainToInstance(CreateOrderDto, { items: [{ ...item, ...options }] }),
    { whitelist: true, forbidNonWhitelisted: true },
  );

describe('CreateOrderDto drink preferences', () => {
  it.each([
    {},
    { sugarLevel: null, iceLevel: null },
    { sugarLevel: 0, iceLevel: 100 },
    { sugarLevel: 100, iceLevel: 0 },
    { sugarLevel: 33, iceLevel: 67 },
  ])(
    'accepts optional preferences and integer percentages: %j',
    async (options) => {
      expect(await check(options)).toEqual([]);
    },
  );

  for (const field of ['sugarLevel', 'iceLevel']) {
    it.each([-1, 101, 25.5, '50', false, [], {}])(
      `rejects invalid ${field}: %j`,
      async (value) => {
        const errors = await check({ [field]: value });
        expect(
          errors[0].children?.[0].children?.map((error) => error.property),
        ).toContain(field);
      },
    );
  }

  it('rejects client prices along with otherwise valid preferences', async () => {
    expect(
      await check({ sugarLevel: 0, iceLevel: 0, unitPrice: 1 }),
    ).not.toEqual([]);
  });

  it.each([undefined, null, '', '   ', 'Để topping riêng', 'a'.repeat(500)])(
    'accepts optional notes up to 500 characters: %j',
    async (note) => {
      expect(await check({ note })).toEqual([]);
    },
  );

  it.each([123, false, [], {}, 'a'.repeat(501)])(
    'rejects invalid notes: %j',
    async (note) => {
      const errors = await check({ note });
      expect(
        errors[0].children?.[0].children?.map((error) => error.property),
      ).toContain('note');
    },
  );

  it('trims notes and normalizes blank notes to null', () => {
    const dto = plainToInstance(CreateOrderDto, {
      items: [
        { ...item, note: '  Để topping riêng  ' },
        { ...item, note: ' \n ' },
      ],
    });
    expect(dto.items.map((entry) => entry.note)).toEqual([
      'Để topping riêng',
      null,
    ]);
  });
});

describe('CreateOrderDto checkout contract', () => {
  const validateBody = (body: unknown) =>
    validate(plainToInstance(CreateOrderDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('trims a coupon code before validating and preserves its case', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      items: [item],
      couponCode: '  Welcome10  ',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.couponCode).toBe('Welcome10');
  });

  it.each(['', ' ', '\n\t'])(
    'rejects a blank coupon code: %j',
    async (couponCode) => {
      expect(await validateBody({ items: [item], couponCode })).not.toEqual([]);
    },
  );

  it.each([undefined, null])('accepts no coupon: %j', async (couponCode) => {
    expect(await validateBody({ items: [item], couponCode })).toEqual([]);
  });

  it.each([
    'userId',
    'status',
    'unitPrice',
    'subtotal',
    'discountAmount',
    'total',
  ])('rejects server-owned top-level field %s', async (field) => {
    const errors = await validateBody({ items: [item], [field]: 'forged' });
    expect(errors.some((error) => error.property === field)).toBe(true);
  });

  it.each([undefined, null, [], Array.from({ length: 21 }, () => item)])(
    'rejects missing or out-of-range item arrays: %j',
    async (items) => {
      expect(await validateBody({ items })).not.toEqual([]);
    },
  );

  it.each([1, 20])('accepts %i input lines', async (count) => {
    expect(
      await validateBody({ items: Array.from({ length: count }, () => item) }),
    ).toEqual([]);
  });

  it.each(
    [[[]], [[item]], [null], ['invalid'], [123]].map((items) => ({ items })),
  )('rejects item entries that are not objects: %j', async ({ items }) => {
    expect(await validateBody({ items })).not.toEqual([]);
  });

  it.each([0, 21, 1.5, '2', null])(
    'rejects invalid quantity: %j',
    async (quantity) => {
      expect(await check({ quantity })).not.toEqual([]);
    },
  );

  it.each([
    { productVariantId: 'unknown' },
    { toppingIds: ['unknown'] },
    { toppingIds: [item.productVariantId, item.productVariantId] },
  ])('rejects malformed IDs or repeated toppings: %j', async (options) => {
    expect(await check(options)).not.toEqual([]);
  });
});
