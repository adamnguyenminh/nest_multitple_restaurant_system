// test-client.ts
import { io } from 'socket.io-client';

const token = 'YOUR_JWT_TOKEN'; // Thay JWT Token hợp lệ của bạn vào đây

const socket = io('http://localhost:3000', {
  auth: { token },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('✅ Client connected với Socket ID:', socket.id);

  // Lấy WebSocket transport bên dưới
  const ws = (socket.io as any).engine.transport.ws;

  if (ws) {
    // Ghi đè phương thức send của WebSocket native -> Vô hiệu hóa toàn bộ gói outbound (bao gồm Pong)
    ws.send = (data: any) => {
      console.log('🚫 Đã CHẶN gói tin gửi đi (bao gồm Pong)! Payload:', data);
    };
    console.log('⚡ Đã vô hiệu hóa thành công luồng gửi dữ liệu của Client!');
  }
});

socket.on('disconnect', (reason: string) => {
  console.log(`❌ Client bị Server ngắt kết nối! Lý do: [${reason}]`);
});
