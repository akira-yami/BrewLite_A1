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
