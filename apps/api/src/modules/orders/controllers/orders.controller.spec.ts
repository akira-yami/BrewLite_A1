import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from '../services/orders.service.js';

describe('OrdersController (Unit Test)', () => {
  let controller: OrdersController;
  let serviceMock: any;

  beforeEach(() => {
    serviceMock = {
      createOrder: vi.fn(),
      cancelOrder: vi.fn(),
      getOrderDetail: vi.fn(),
    };
    controller = new OrdersController(serviceMock as unknown as OrdersService);
  });

  it('create - nên gọi orders.createOrder và trả về data bọc trong envelope', async () => {
    const mockUser = { id: 'u-1', role: 'CUSTOMER' as any };
    const mockDto = { items: [] } as any;
    const mockOrder = { id: 'o-1', total: 50000 };
    serviceMock.createOrder.mockResolvedValue(mockOrder);

    const result = await controller.create(mockUser, mockDto);

    expect(serviceMock.createOrder).toHaveBeenCalledWith('u-1', mockDto);
    expect(result).toEqual({ data: mockOrder });
  });

  it('getMyOrders - nên gọi orders.getMyOrders và trả về data bọc trong envelope', async () => {
    const mockUser = { id: 'u-1', role: 'CUSTOMER' as any };
    const mockOrders = [{ id: 'o-1', total: 50000 }];
    serviceMock.getMyOrdersPage = vi.fn().mockResolvedValue({ data: mockOrders, meta: { nextCursor: null } });

    const result = await controller.getMyOrders(mockUser);

    expect(serviceMock.getMyOrdersPage).toHaveBeenCalledWith('u-1', {});
    expect(result).toEqual({ data: mockOrders, meta: { nextCursor: null } });
  });

  it('getOrderDetail - nên gọi orders.getOrderDetail và trả về data bọc trong envelope', async () => {
    const mockUser = { id: 'u-1', role: 'CUSTOMER' as any };
    const mockDetail = { id: 'o-1', total: 50000 };
    serviceMock.getOrderDetail = vi.fn().mockResolvedValue(mockDetail);

    const result = await controller.getOrderDetail('o-1', mockUser);

    expect(serviceMock.getOrderDetail).toHaveBeenCalledWith('o-1', 'u-1');
    expect(result).toEqual({ data: mockDetail });
  });
  it('cancelOrder - hủy đơn bằng principal đã xác thực và trả về chi tiết trạng thái mới', async () => {
    const mockUser = { id: 'u-1', role: 'CUSTOMER' as any };
    const mockDetail = { id: 'o-1', status: 'CANCELLED' };
    serviceMock.cancelOrder.mockResolvedValue(undefined);
    serviceMock.getOrderDetail.mockResolvedValue(mockDetail);

    const result = await controller.cancelOrder('o-1', mockUser);

    expect(serviceMock.cancelOrder).toHaveBeenCalledWith(
      'o-1',
      'u-1',
      'Khách hàng yêu cầu hủy đơn hàng',
      false,
    );
    expect(serviceMock.getOrderDetail).toHaveBeenCalledWith('o-1', 'u-1');
    expect(result).toEqual({ data: mockDetail });
  });

});