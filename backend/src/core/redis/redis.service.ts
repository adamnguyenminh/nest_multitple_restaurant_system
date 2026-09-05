// redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private pubClient: RedisClientType;
  private subClient: RedisClientType;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.pubClient = createClient({ url: redisUrl });
    this.subClient = this.pubClient.duplicate();

    this.pubClient.on('error', (err) =>
      console.error('Redis PubClient Error:', err),
    );
    this.subClient.on('error', (err) =>
      console.error('Redis SubClient Error:', err),
    );
  }

  async onModuleInit() {
    if (!this.pubClient.isOpen) {
      await this.pubClient.connect();
    }
    if (!this.subClient.isOpen) {
      await this.subClient.connect();
    }
    console.log('Redis Service initialized successfully');
  }

  async onModuleDestroy() {
    await Promise.all([
      this.pubClient.isOpen && this.pubClient.disconnect(),
      this.subClient.isOpen && this.subClient.disconnect(),
    ]);
  }

  async publish(channel: string, message: any) {
    if (!this.pubClient.isOpen) await this.pubClient.connect();
    await this.pubClient.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, callback: (data: any) => void) {
    // Đảm bảo client đã kết nối trước khi subscribe
    if (!this.subClient.isOpen) {
      await this.subClient.connect();
    }
    await this.subClient.subscribe(channel, (message) => {
      callback(JSON.parse(message));
    });
  }
}
