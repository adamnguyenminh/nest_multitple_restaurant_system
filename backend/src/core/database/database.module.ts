import { Module, Global, DynamicModule } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SHARD_CONNECTIONS } from './database.constants';
import { EntityRegistry } from './entity_registry.service';
import { ShardRouterService } from './shard_router.service';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    // Danh sách các key shard khai báo trong SHARD_CONNECTIONS
    const shardKeys = Object.keys(SHARD_CONNECTIONS) as Array<
      keyof typeof SHARD_CONNECTIONS
    >;

    // Khởi tạo dynamic TypeOrmModule cho từng Shard Connection
    const shardImports = shardKeys.map((key, index) => {
      const connectionName = SHARD_CONNECTIONS[key];

      return TypeOrmModule.forRootAsync({
        name: connectionName, // Phân biệt từng Connection Shard
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService): TypeOrmModuleOptions => {
          const isDev = config.get<string>('NODE_ENV') !== 'production';

          return {
            type: 'mysql',
            host: config.get<string>(`DB_SHARD_${index}_HOST`, 'localhost'),
            port: config.get<number>(`DB_SHARD_${index}_PORT`, 3306 + index),
            username: config.get<string>('DB_USER', 'root'),
            password: config.get<string>('DB_PASS', 'root'),
            database: config.get<string>(
              `DB_SHARD_${index}_NAME`,
              `restaurant_shard_${index}`,
            ),

            // 🟢 Tải toàn bộ Entity từ EntityRegistry
            entities: EntityRegistry.getEntities(),
            autoLoadEntities: true,

            // ⚠️ Không bao giờ bật synchronize ở Production
            synchronize: config.get<boolean>('DB_SYNCHRONIZE', isDev),

            // Tối ưu Connection Pool cho từng Shard
            extra: {
              connectionLimit: config.get<number>('DB_POOL_LIMIT', 10),
            },
          };
        },
      });
    });

    return {
      module: DatabaseModule,
      imports: [...shardImports],
      providers: [EntityRegistry, ShardRouterService],
      exports: [EntityRegistry, ShardRouterService, ...shardImports],
    };
  }
}
