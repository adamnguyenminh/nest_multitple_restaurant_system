import { Controller, Post, Body } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Controller('test-realtime')
export class RealtimeController {
  constructor(private readonly realtimeGateway: RealtimeGateway) {}

  @Post()
  testEmit(@Body() body: any) {
    this.realtimeGateway.notifyTableUpdate(body);
    return { success: true, message: 'Event emitted' };
  }
}
