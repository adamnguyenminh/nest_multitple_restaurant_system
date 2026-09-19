import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Connection, Client } from '@temporalio/client';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { EntityRegistry } from '../../core/database/entity_registry.service';
import { Table } from './entities/table.entity';
import { OutboxEntity } from '../orders/entities/outbox.entity';
import { TableActivities } from './table.activities';
import { TemporalWorkerService } from './temporal-worker.service';

export const TEMPORAL_CLIENT = 'TEMPORAL_CLIENT';

// Module tự đăng ký Table entity vào Registry
EntityRegistry.register([Table]);

@Module({
  imports: [TypeOrmModule.forFeature([Table, OutboxEntity])],
  controllers: [TablesController],
  providers: [
    TablesService,
    TableActivities,
    TemporalWorkerService,
    {
      provide: TEMPORAL_CLIENT,
      useFactory: async () => {
        const connection = await Connection.connect({
          address: 'localhost:7233',
        });
        return new Client({ connection });
      },
    },
  ],
})
export class TablesModule {}
