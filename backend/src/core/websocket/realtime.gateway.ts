// realtime.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({
  cors: {
    origin: '*', // Cho phép kết nối từ Postman/Client
    // 1. Cấu hình Heartbeat ở tầng Engine.IO
    pingInterval: 5000, // Gửi Ping mỗi 10 giây
    pingTimeout: 3000, // Sau 5 giây không phản hồi Pong -> Coi như đứt kết nối và ngắt Socket
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server; // Lấy instance WebSocket Server

  constructor(private readonly redisService: RedisService) {}

  async afterInit() {
    console.log('[Gateway] Đang đăng ký Redis Channel...');

    try {
      await this.redisService.subscribe('REALTIME_TABLE_UPDATE', (payload) => {
        console.log('[Gateway] Nhận message từ Redis Pub/Sub:', payload);
        const { restaurant_id, data } = payload;
        if (restaurant_id) {
          const roomName = `restaurant_${restaurant_id}`;
          console.log(
            `[Gateway] Broadcast event [table_updated] tới Room: ${roomName}`,
          );

          // CHỈ EMIT TỚI CLIENT TRONG ROOM CỦA NHÀ HÀNG NÀY
          this.server.to(roomName).emit('table_updated', data);
        }
        // this.server.emit('table_updated', data);
      });
      console.log(
        '[Gateway] Lắng nghe Channel REALTIME_TABLE_UPDATE thành công!',
      );
    } catch (error) {
      console.error('[Gateway] Lỗi khi subscribe Redis channel:', error);
    }
  }

  handleConnection(client: Socket) {
    // Cách 1: Auto-join Room qua Handshake Query Param (e.g. ?restaurant_id=101)
    const restaurantId = client.handshake.query.restaurant_id;
    if (restaurantId) {
      const roomName = `restaurant_${restaurantId}`;
      client.join(roomName);
      console.log(`🔌 Client ${client.id} đã tự động join vào ${roomName}`);
    }
  }

  // Cách 2: Client gửi Event chủ động để Join Room
  @SubscribeMessage('join_restaurant')
  handleJoinRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { restaurant_id: string },
  ) {
    const roomName = `restaurant_${payload.restaurant_id}`;
    client.join(roomName);
    console.log(`Client ${client.id} vừa join Room: ${roomName}`);
    return { status: 'success', joined: roomName };
  }

  handleDisconnect(client: Socket) {
    console.log(`Client đã ngắt kết nối: ${client.id}`);
  }

  // 2. Custom Application-Level Heartbeat (Dùng cho Client muốn chủ động ping check latency)
  @SubscribeMessage('ping_check')
  handlePing(client: Socket) {
    return { event: 'pong_check', timestamp: new Date().toISOString() };
  }

  @SubscribeMessage('simulate_heartbeat_fail')
  handleSimulateHeartbeatFail(client: Socket) {
    console.log(
      `[Test Hook] Đã kích hoạt giả lập Heartbeat Fail cho Socket: ${client.id}`,
    );

    // 1. Truy cập vào Engine.IO Socket bên dưới
    const engineSocket = (client as any).conn;

    if (engineSocket) {
      // 2. Can thiệp trực tiếp vào Transport Layer bên dưới để gỡ bỏ hoàn toàn listener xử lý Packet
      const transport = engineSocket.transport;

      if (transport) {
        // Gỡ bỏ tất cả listeners xử lý gói tin incoming từ Client (bao gồm gói Pong)
        transport.removeAllListeners('packet');

        console.log(
          `[Server] Đã gỡ bỏ toàn bộ Packet Listeners của Socket ${client.id}`,
        );
      }

      // 3. Ép Server chạy ngay đợt Ping Timeout bằng cách hủy Timer hiện tại và gọi hàm ngắt kết nối
      // Nếu muốn chờ Ping Timeout tự nhiên sau vài giây:
      if (engineSocket.pingTimeoutTimer) {
        clearTimeout(engineSocket.pingTimeoutTimer);

        // Khởi tạo một Timer mới ép ngắt kết nối sau đúng 2 giây với lý do 'ping timeout'
        engineSocket.pingTimeoutTimer = setTimeout(() => {
          console.log(
            `[Server] Hết thời gian chờ Pong -> Trigger Ping Timeout cho ${client.id}`,
          );
          engineSocket.onClose('ping timeout');
        }, 2000);
      }
    }

    return {
      status: 'success',
      message: 'Heartbeat fail triggered! Socket will drop in 2 seconds.',
    };
  }

  /**
   * Method công khai để Consumer hoặc Service khác gọi vào gửi Event
   */
  notifyTableUpdate(data: any) {
    console.log('Kiểm tra this.server trong Gateway:', !!this.server);

    if (!this.server) {
      console.error(
        'ERROR: this.server bị UNDEFINED! Consumer đang gọi một instance Gateway chưa được gắn Socket Server.',
      );
      return;
    }

    console.log('Emitting event [table_updated] tới tất cả clients...');
    this.server.emit('table_updated', data);
  }
}
