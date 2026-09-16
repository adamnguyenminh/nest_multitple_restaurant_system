import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from '@nestjs-cls/transactional';
import { OrderEntity } from './entities/order.entity';
import { OutboxEntity } from './entities/outbox.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(OutboxEntity)
    private readonly outboxRepository: Repository<OutboxEntity>,
  ) {}

  @Transactional()
  async createOrder(dto: CreateOrderDto): Promise<OrderEntity> {
    // 1. Tạo và lưu Order nghiệp vụ
    const order = this.orderRepository.create({
      userId: dto.userId,
      amount: dto.amount,
      items: dto.items,
      status: 'PENDING',
    });
    const savedOrder = await this.orderRepository.save(order);

    // Sinh UUID cho Outbox Event trước
    const outboxId = crypto.randomUUID();

    // 2. Tạo Outbox Event trong cùng DB Transaction qua ALS Context
    const outboxEvent = this.outboxRepository.create({
      id: outboxId, // Gán ID trực tiếp
      aggregateType: 'Order',
      aggregateId: savedOrder.id,
      eventType: 'ORDER_CREATED',
      payload: {
        id: outboxId, // BẮT BỘC: Thêm field id vào đây để Debezium stream sang Kafka
        orderId: savedOrder.id,
        userId: savedOrder.userId,
        amount: savedOrder.amount,
        items: savedOrder.items,
        createdAt: savedOrder.createdAt,
      },
    });
    await this.outboxRepository.save(outboxEvent);

    return savedOrder;
  }
}
