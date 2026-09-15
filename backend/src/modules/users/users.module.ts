import { Module } from '@nestjs/common';
import { SHARD_CONNECTIONS } from '../../core/database/database.constants';
import { UserRepository } from './users.repository';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';

@Module({
  providers: [
    {
      provide: UserRepository,
      useFactory: (dataSource: DataSource) => new UserRepository(dataSource),
      inject: [getDataSourceToken(SHARD_CONNECTIONS.SHARD_0)], // Ràng buộc chính xác SHARD_0
    },
  ],
  exports: [UserRepository],
})
export class UsersModule {}
