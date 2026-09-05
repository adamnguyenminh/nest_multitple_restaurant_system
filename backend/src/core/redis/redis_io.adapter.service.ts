import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { INestApplicationContext } from '@nestjs/common';
import { createClient } from 'redis';

export class RedisIoAdapterService extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // Khởi tạo Pub/Sub Client riêng cho Adapter
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    // Lắng nghe lỗi kết nối nếu có
    pubClient.on('error', (err) =>
      console.error('Redis PubClient Error:', err),
    );
    subClient.on('error', (err) =>
      console.error('Redis SubClient Error:', err),
    );

    // Thực hiện kết nối
    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.adapterConstructor = createAdapter(pubClient, subClient);
    console.log('RedisIoAdapter connected successfully!');
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
