import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryEntity } from './entities/inventory.entity';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryEntity)
    private readonly inventoryRepo: Repository<InventoryEntity>,
  ) {}

  async deductStock(
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<void> {
    // Thêm guard check chống TypeError
    if (!Array.isArray(items) || items.length === 0) {
      this.logger.warn(
        '[DEDUCT STOCK] Items list is empty or invalid. Skipping.',
      );
      return;
    }

    for (const item of items) {
      this.logger.log(
        `[STOCK DEDUCTION] Product: ${item.productId} | Qty: -${item.quantity}`,
      );

      await this.inventoryRepo.query(
        `
      INSERT INTO inventories (product_id, stock, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (product_id)
      DO UPDATE SET stock = inventories.stock - $3, updated_at = NOW()
      `,
        [item.productId, 1000 - item.quantity, item.quantity],
      );
    }
  }
}
