import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { ShardRouterService } from '../../core/database/shard_router.service';
import { EntityRegistry } from '../../core/database/entity_registry.service';
import { Table } from './entities/table.entity';
import { TableRepository } from './table.repository';
import { SHARD_CONNECTIONS } from '../../core/database/database.constants';
import { JwtModule } from '@nestjs/jwt';

// Module tự đăng ký Table entity vào Registry
EntityRegistry.register([Table]);

@Module({
  imports: [JwtModule],
  controllers: [TablesController],
  providers: [
    TablesService,
    ShardRouterService,
    {
      provide: TableRepository,
      useFactory: (dataSource: DataSource) => new TableRepository(dataSource),
      inject: [getDataSourceToken(SHARD_CONNECTIONS.SHARD_0)], // Ràng buộc chính xác SHARD_0
    },
  ],
  exports: [TableRepository],
})
export class TablesModule {}
