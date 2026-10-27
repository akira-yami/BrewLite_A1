import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { CatalogService } from '../catalog/services/catalog.service.js';

export class InventoryVersionConflict extends Error {}

@Injectable()
export class InventoryService {
  constructor(private readonly catalog: CatalogService) {}

  async reserve(
    tx: Prisma.TransactionClient,
    orderId: string,
    expiresAt: Date,
    needs: Map<string, { quantity: number; version: number }>,
  ) {
    for (const [id, need] of [...needs].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const updated = await this.catalog.reserveVariant(
        tx,
        id,
        need.quantity,
        need.version,
      );
      if (updated.count !== 1) {
        // Abort and re-quote in a fresh transaction, never reuse stale snapshots.
        throw new InventoryVersionConflict();
      }
      await tx.inventoryReservation.create({
        data: {
          orderId,
          productVariantId: id,
          quantity: need.quantity,
          status: 'ACTIVE',
          expiresAt,
        },
      });
    }
  }
}
