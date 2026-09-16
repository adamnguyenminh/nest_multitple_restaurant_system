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

      await this.inventoryRepo
        .createQueryBuilder()
        .insert()
        .into(InventoryEntity)
        .values({
          productId: item.productId,
          stock: 1000 - item.quantity, // Khởi tạo kho nếu chưa có bản ghi
        })
        .orUpdate(
          ['stock'], // Các cột cần UPDATE khi bị trùng PK (product_id)
          ['product_id'], // Cột PK/Unique constraint gây ra conflict
        )
        // Dùng Cú pháp PostgreSQL Native để trừ trực tiếp stock hiện tại
        .setParameter('qty', item.quantity)
        .execute();
    }
  }
}
