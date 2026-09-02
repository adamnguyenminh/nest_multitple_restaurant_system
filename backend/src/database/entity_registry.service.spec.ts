import { Test, TestingModule } from '@nestjs/testing';
import { EntityRegistryService } from './entity_registry.service';

describe('EntityRegistryService', () => {
  let service: EntityRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EntityRegistryService],
    }).compile();

    service = module.get<EntityRegistryService>(EntityRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
