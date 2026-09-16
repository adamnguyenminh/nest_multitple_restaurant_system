import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryEntity } from './entities/inventory.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryEntity, ProcessedEventEntity])],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
