// Kiểm tra readiness khi truy vấn DB thành công hoặc lỗi.
import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../../src/modules/health/health.controller.js';
import { HealthService } from '../../src/modules/health/health.service.js';
import type { PrismaService } from '../../src/database/prisma.service.js';

function makeController(query: () => Promise<unknown>) {
  const prisma = { $queryRaw: query } as unknown as PrismaService;
  return new HealthController(new HealthService(prisma));
}

describe('HealthController.health', () => {
  it('returns ready after a successful database probe', async () => {
    const controller = makeController(vi.fn().mockResolvedValue([{ '?column?': 1 }]));
    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
  });

  it('returns 503 ServiceUnavailableException when the database probe fails', async () => {
    const controller = makeController(vi.fn().mockRejectedValue(new Error('database connection failed')));
    await expect(controller.health()).rejects.toThrow(ServiceUnavailableException);
  });
});
