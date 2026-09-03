# Khởi tạo NestJS app trong thư mục backend

npx @nestjs/cli new backend --strict --skip-git --package-manager npm
cd backend

# Cài đặt các thư viện kết nối Database, Queue, Config

npm install --save @nestjs/typeorm typeorm mysql2 @nestjs/microservices amqplib amqp-connection-manager @nestjs/config

# --------------------------------------------------------

# 📝 Lesson Learned: Real-time Communication in Distributed Architecture (NestJS + RabbitMQ + Redis Pub/Sub + Socket.IO)

## 📌 Context & Problem

Khi triển khai kiến trúc Microservices tách biệt giữa **Gateway Process** (`main.ts` - xử lý WebSocket/HTTP) và **Worker Process** (`main-worker.ts` - xử lý RabbitMQ Consumer), hệ thống gặp vấn đề:

- **Vấn đề 1:** Worker nhận event từ RabbitMQ và gọi `RealtimeGateway.notifyTableUpdate()`, nhưng Client (Postman) không nhận được payload.
- **Nguyên nhân:** Hai process chạy trên các vùng nhớ hoàn toàn độc lập. Instance `Server` của Socket.IO trên Worker không nắm giữ kết nối WebSocket nào của Client (Postman chỉ kết nối tới Gateway `main.ts`).
- **Vấn đề 2:** Khởi tạo `RedisIoAdapter` bị crash với lỗi `pSubscribe of undefined` hoặc `Cannot read properties of undefined (reading 'subscribe')`.
- **Nguyên nhân:** Lỗi bất đồng bộ lifecycle giữa `onModuleInit()` của NestJS và `afterInit()` của WebSocket Gateway, khiến Client Redis chưa hoàn tất kết nối đã bị truy cập.

---

## 🛠️ Solution Architecture

Giải pháp là xây dựng cơ chế **Redis Pub/Sub Layer** trung gian giữa Worker và Gateway:

1. **Worker Process:** Nhận message từ RabbitMQ $\rightarrow$ Publish payload vào Redis Channel (`REALTIME_TABLE_UPDATE`).
2. **Gateway Process:** Subscribe Redis Channel $\rightarrow$ Nhận payload từ Redis $\rightarrow$ Broadcast tới Client via Socket.IO (`this.server.emit`).

---

## 🚀 Postman Socket.IO Testing Guide

### 1. Khởi động các Process

Đảm bảo cả 2 process đều đang hoạt động:

```bash
# Terminal 1: Chạy Gateway Server
npm run start:dev --main main.ts

# Terminal 2: Chạy Worker Consumer
npm run start:dev --main main-worker.ts
```

### 2. Thiết lập kết nối trên Postman

- Mở Postman $\rightarrow$ Chọn New $\rightarrow$ Socket.IO Request.
- URL Kết nối:

```bash
http://localhost:3000
```

- Cấu hình Handshake Path (nếu có): /socket.io (Mặc định).
- Bấm Connect. Kiểm tra log Terminal Gateway thấy: 🔌 Client kết nối thành công: <socket_id>.

### 3. Lắng nghe Event (Listener Setup)

- Tại tab request Socket.IO trên Postman, chuyển sang tab Events.
- Tại ô Listen for events, nhập tên event:

```bash
table_updated
```

- Bấm nút Listen (bắt buộc phải bật Listen trước khi trigger message).

### 4. Trigger & Verifying (Kiểm thử luồng)

- Bắn 1 message/payload dữ liệu vào RabbitMQ Queue tables_queue.
- Kiểm tra Terminal Worker:

```bash
📥 [Worker] Nhận event từ RabbitMQ: { "table_id": 1, "status": "OCCUPIED" }
📢 [Worker] Đã publish event sang Redis Pub/Sub
```

- Kiểm tra Terminal Gateway:

```bash
📢 [Gateway] Nhận message từ Redis Pub/Sub
```

- Kiểm tra Postman: Tắt/Mở khung Response/Messages, bạn sẽ thấy payload JSON được push về real-time dưới dạng Server Event:

```JSON
{
  "table_id": 1,
  "status": "OCCUPIED"
}
```

### 🔑 Key Takeaways (Kinh nghiệm rút ra)

Tách biệt Process & Transport: Không dùng app.useWebSocketAdapter() trong Microservice Worker thuần (createMicroservice), vì Worker không khởi tạo HTTP Server.

Safe Redis Connection Lifecycle: Khởi tạo createClient() trong constructor của RedisService và luôn kiểm tra trạng thái isOpen trước khi gọi .publish() hoặc .subscribe() để tránh lỗi undefined.

NestJS App Initialization: Luôn gọi await app.init() trong file main.ts nếu các Gateway/Adapter phụ thuộc vào onModuleInit() của các Global Provider khác.

### 💓 Heartbeat Failure Simulation & Reconnection Strategy

Trong môi trường phân tán, việc xử lý các kết nối "ma" (Ghost Connections - do rớt mạng đột ngột mà Client không kịp gửi gói `disconnect`) là cực kỳ quan trọng. Hệ thống sử dụng cơ chế Ping/Pong của Engine.IO kết hợp với Test Hook tại Gateway để kiểm thử luồng tự động kết nối lại (Auto-Reconnect).

### 1. Cấu hình Heartbeat tại Gateway (`realtime.gateway.ts`)

Bổ sung các tham số `pingInterval` và `pingTimeout` tại decorator `@WebSocketGateway`:

```typescript
@WebSocketGateway({
  cors: { origin: '*' },
  pingInterval: 5000, // Gửi Ping mỗi 5 giây
  pingTimeout: 3000,  // Quá 3 giây không nhận gói Pong -> Coi như đứt mạng
})
```

### 2. Kỹ thuật Test Hook giả lập Ping Timeout tại Server

Do cơ chế Multi-Process của Postman Desktop (Electron) và các ràng buộc bảo mật trên Browser khiến việc can thiệp vào gói Pong từ phía Client gặp nhiều hạn chế, hệ thống thiết lập 1 Test Hook (simulate_heartbeat_fail) trực tiếp tại Server để chủ động tạo ra sự cố Heartbeat Fail.

Implementation Code:

```TypeScript
// realtime.gateway.ts
@SubscribeMessage('simulate_heartbeat_fail')
handleSimulateHeartbeatFail(client: Socket) {
  console.log(`🧪 [Test Hook] Giả lập Heartbeat Fail cho Socket: ${client.id}`);

  const engineSocket = (client as any).conn;

  if (engineSocket) {
    // 1. Gỡ bỏ Listener xử lý gói tin của Transport Layer -> Chặn việc tiếp nhận Pong
    const transport = engineSocket.transport;
    if (transport) {
      transport.removeAllListeners('packet');
      console.log(`🚫 [Server] Đã gỡ bỏ Packet Listeners của Socket ${client.id}`);
    }

    // 2. Can thiệp Timer -> Ép Server trigger Ping Timeout sau 2 giây
    if (engineSocket.pingTimeoutTimer) {
      clearTimeout(engineSocket.pingTimeoutTimer);

      engineSocket.pingTimeoutTimer = setTimeout(() => {
        console.log(`⏱️ [Server] Hết thời gian chờ Pong -> Trigger Ping Timeout`);
        engineSocket.onClose('ping timeout');
      }, 2000);
    }
  }

  return { status: 'success', message: 'Heartbeat fail triggered! Socket will drop in 2 seconds.' };
}
```

### 3. Kịch bản Kiểm thử & Luồng Tự động Reconnect

## A. Kiểm thử qua Node.js Client Script (test-client.ts)

```TypeScript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_JWT_TOKEN' },
  transports: ['websocket'],
  reconnection: true,        // Kích hoạt cơ chế tự động kết nối lại
  reconnectionAttempts: 5,   // Thử lại tối đa 5 lần
  reconnectionDelay: 1000,   // Chờ 1 giây trước mỗi lần thử lại
});

socket.on('connect', () => {
  console.log(`✅ Connected với Socket ID mới: ${socket.id}`);

  // Chỉ trigger Test Hook ở lần kết nối đầu tiên
  if (!(socket as any)._hasTestedFail) {
    (socket as any)._hasTestedFail = true;
    setTimeout(() => socket.emit('simulate_heartbeat_fail', {}), 1000);
  } else {
    console.log('🎉 RECONNECT THÀNH CÔNG VÀ TIẾP TỤC HOẠT ĐỘNG!');
  }
});

socket.on('disconnect', (reason) => {
  console.warn(`⚠️ Disconnected. Reason: [${reason}] -> Đang tự động reconnect...`);
});
```

## B. Các bước Test cực đơn giản trực tiếp trên Postman (Không cần DevTools/Script)

- Mở Postman, bấm Connect tới http://localhost:3000.
- Chuyển sang tab Message trên Postman.
- Nhập Event Name: simulate_heartbeat_fail, nội dung payload: {}.
- Bấm Send.
- Quan sát Terminal NestJS Server:
  - Ngay khi nhận event, Server báo: 🧪 [Test Hook] Đã kích hoạt giả lập Heartbeat Fail...
  - Ở kỳ Ping tiếp theo, Server nhận Pong nhưng log out: 🚫 Server nhận gói Pong từ ... nhưng cố tình BỎ QUA!
  - Đúng $5s + 3s = 8s$ sau, Server tự động ngắt kết nối và in log:

```bash
❌ Client disconnected: <socket_id>. Lý do: [ping timeout]
```

## 💡 Ưu điểm của cách này

- Không cần đụng vào Client/DevTools: Mọi thứ được xử lý 100% bằng cách gửi 1 WebSocket Message từ Postman.
- Chính xác & Cục bộ: Chỉ socket nào gửi event simulate_heartbeat_fail mới bị drop connection, các client/Postman tabs khác vẫn hoạt động bình thường.
- Dễ tích hợp Automation: Sau này làm E2E Test chỉ cần gọi event này để test luồng reconnect của Frontend.

## C. 🔑 Key Takeaways về Heartbeat & Reconnection

- Transport-Level Isolation: Việc can thiệp trực tiếp vào transport.removeAllListeners('packet') trên engineSocket giúp test chính xác cơ chế timeout ở Server mà không làm ảnh hưởng tới các Client Socket khác đang kết nối.

- Stateless Handshake Security: Vì thông tin Auth và Multi-tenant (restaurant_id) nằm trong JWT Token gửi kèm Handshake, khi Client tự reconnect (tạo Socket ID mới), Gateway sẽ tự động khôi phục đúng Room mà không cần Client phải gửi thêm lệnh Join Room thủ công.
