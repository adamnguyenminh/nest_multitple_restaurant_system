import { Test, TestingModule } from '@nestjs/testing';
import { RedisIoAdapterService } from './redis_io.adapter.service';

describe('RedisIoAdapterService', () => {
  let service: RedisIoAdapterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisIoAdapterService],
    }).compile();

    service = module.get<RedisIoAdapterService>(RedisIoAdapterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
