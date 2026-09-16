import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('outbox_messages')
export class OutboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'aggregatetype', type: 'varchar', length: 255 })
  aggregateType: string;

  @Column({ name: 'aggregateid', type: 'varchar', length: 255 })
  aggregateId: string;

  @Column({ name: 'type', type: 'varchar', length: 255 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @CreateDateColumn({ name: 'createdat', type: 'timestamptz' })
  createdAt: Date;
}
