import { Module } from '@nestjs/common';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { OrderEntity } from '../orders/entities/order.entity';
import { OutboxEntity } from '../orders/entities/outbox.entity';
import { InventoryEntity } from '../inventory/entities/inventory.entity';
import { ProcessedEventEntity } from '../inventory/entities/processed-event.entity';
import { Table } from '../tables/entities/table.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'secret',
      database: process.env.DB_NAME || 'order_db',
      entities: [
        OrderEntity,
        OutboxEntity,
        InventoryEntity,
        ProcessedEventEntity,
        Table,
      ],
      synchronize: true,
      logging: false,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [TypeOrmModule],
          adapter: new TransactionalAdapterTypeOrm({
            // Sử dụng helper getDataSourceToken() từ @nestjs/typeorm để lấy đúng token mặc định
            dataSourceToken: getDataSourceToken(),
          }),
        }),
      ],
    }),
  ],
})
export class DatabaseModule {}
