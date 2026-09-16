import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEntity } from './entities/order.entity';
import { OutboxEntity } from './entities/outbox.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity, OutboxEntity])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
