import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SHARD_CONNECTIONS, TOTAL_SHARDS } from './database.constants';

@Injectable()
export class ShardRouterService {
  constructor(
    @InjectDataSource(SHARD_CONNECTIONS.SHARD_0)
    private readonly shard0: DataSource,
    @InjectDataSource(SHARD_CONNECTIONS.SHARD_1)
    private readonly shard1: DataSource,
    @InjectDataSource(SHARD_CONNECTIONS.SHARD_2)
    private readonly shard2: DataSource,
  ) {}

  /**
   * Xác định shardKey dựa vào request_id (Thuật toán Hash/Modulo đơn giản)
   */
  getShardId(requestId: number | string): number {
    const numId =
      typeof requestId === 'string' ? parseInt(requestId, 10) : requestId;
    return Math.abs(numId) % TOTAL_SHARDS;
  }

  getShardIdByTableIndex(tableIndex: number): number {
    return tableIndex % TOTAL_SHARDS;
  }

  getDataSourceByShardId(shardId: number): DataSource {
    switch (shardId) {
      case 0:
        return this.shard0;
      case 1:
        return this.shard1;
      case 2:
        return this.shard2;
      default:
        throw new Error(`Invalid Shard ID: ${shardId}`);
    }
  }

  getDataSourceBytaSourceByRequestIndex(
    requestId: number | string,
  ): DataSource {
    const shardId = this.getShardId(requestId);
    return this.getDataSourceByShardId(shardId);
  }

  getDataSourceByTableIndex(tableIndex: number): DataSource {
    const shardId = this.getShardIdByTableIndex(tableIndex);
    return this.getDataSourceByShardId(shardId);
  }
}
