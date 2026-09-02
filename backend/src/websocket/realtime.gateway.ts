// realtime.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({
  cors: {
    origin: '*', // Cho phép kết nối từ Postman/Client
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server; // Lấy instance WebSocket Server

  constructor(private readonly redisService: RedisService) {}

  async afterInit() {
    console.log('⚡ [Gateway] Đang đăng ký Redis Channel...');

    try {
      await this.redisService.subscribe('REALTIME_TABLE_UPDATE', (data) => {
        console.log('📢 [Gateway] Nhận message từ Redis Pub/Sub:', data);
        this.server.emit('table_updated', data);
      });
      console.log(
        '✅ [Gateway] Lắng nghe Channel REALTIME_TABLE_UPDATE thành công!',
      );
    } catch (error) {
      console.error('❌ [Gateway] Lỗi khi subscribe Redis channel:', error);
    }
  }

  handleConnection(client: Socket) {
    console.log(`🔌 Client đã kết nối WebSocket: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ Client đã ngắt kết nối: ${client.id}`);
  }

  /**
   * Method công khai để Consumer hoặc Service khác gọi vào gửi Event
   */
  notifyTableUpdate(data: any) {
    console.log('🔍 Kiểm tra this.server trong Gateway:', !!this.server);

    if (!this.server) {
      console.error(
        '❌ ERROR: this.server bị UNDEFINED! Consumer đang gọi một instance Gateway chưa được gắn Socket Server.',
      );
      return;
    }

    console.log('📢 Emitting event [table_updated] tới tất cả clients...');
    this.server.emit('table_updated', data);
  }
}
