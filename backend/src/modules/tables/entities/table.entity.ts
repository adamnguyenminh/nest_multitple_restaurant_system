import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SEATED = 'SEATED',
  CLEANING = 'CLEANING',
}

@Entity('restaurant_tables')
@Index('idx_restaurant_table', [
  'restaurantId',
  'capacity',
  'status',
  'shardId',
])
export class Table {
  @PrimaryGeneratedColumn({ name: 'entity_id', type: 'int' })
  id: number;

  @Column({ unique: true })
  code: string;

  @Column({ name: 'restaurant_id', type: 'int' })
  restaurantId: number;

  @Column()
  capacity: number;

  @Column({
    type: 'enum',
    enum: TableStatus,
    default: TableStatus.AVAILABLE,
  })
  status: TableStatus;

  @Column({ name: 'shard_id', type: 'int' })
  shardId: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
