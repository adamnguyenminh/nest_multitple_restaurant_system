import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('inventories')
export class InventoryEntity {
  @PrimaryColumn({ name: 'product_id', type: 'varchar', length: 255 })
  productId: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
