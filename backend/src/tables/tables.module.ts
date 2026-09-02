import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { ShardRouterService } from '../database/shard_router.service';
import { EntityRegistry } from '../database/entity_registry.service';
import { Table } from './entities/table.entity';

// Module tự đăng ký Table entity vào Registry
EntityRegistry.register([Table]);

@Module({
  controllers: [TablesController],
  providers: [TablesService, ShardRouterService],
})
export class TablesModule {}
