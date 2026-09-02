import { Test, TestingModule } from '@nestjs/testing';
import { ShardRouterService } from './shard_router.service';

describe('ShardRouterService', () => {
  let service: ShardRouterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShardRouterService],
    }).compile();

    service = module.get<ShardRouterService>(ShardRouterService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
