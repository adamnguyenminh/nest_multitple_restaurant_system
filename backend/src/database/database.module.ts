import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SHARD_CONNECTIONS } from './database.constants';
import { EntityRegistry } from './entity_registry.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: SHARD_CONNECTIONS.SHARD_0,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_SHARD_0_HOST', 'localhost'),
        port: config.get<number>('DB_SHARD_0_PORT', 3306),
        username: config.get<string>('DB_USER', 'root'),
        password: config.get<string>('DB_PASS', 'root'),
        database: config.get<string>('DB_SHARD_0_NAME', 'restaurant_shard_0'),
        autoLoadEntities: true,
        entities: EntityRegistry.getEntities(),
        synchronize: false,
      }),
    }),
    TypeOrmModule.forRootAsync({
      name: SHARD_CONNECTIONS.SHARD_1,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_SHARD_1_HOST', 'localhost'),
        port: config.get<number>('DB_SHARD_1_PORT', 3307),
        username: config.get<string>('DB_USER', 'root'),
        password: config.get<string>('DB_PASS', 'root'),
        database: config.get<string>('DB_SHARD_1_NAME', 'restaurant_shard_1'),
        autoLoadEntities: true,
        entities: EntityRegistry.getEntities(),
        synchronize: false,
      }),
    }),
    TypeOrmModule.forRootAsync({
      name: SHARD_CONNECTIONS.SHARD_2,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_SHARD_2_HOST', 'localhost'),
        port: config.get<number>('DB_SHARD_2_PORT', 3308),
        username: config.get<string>('DB_USER', 'root'),
        password: config.get<string>('DB_PASS', 'root'),
        database: config.get<string>('DB_SHARD_2_NAME', 'restaurant_shard_2'),
        autoLoadEntities: true,
        entities: EntityRegistry.getEntities(),
        synchronize: false,
      }),
    }),
  ],
  providers: [EntityRegistry],
})
export class DatabaseModule {}
