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
