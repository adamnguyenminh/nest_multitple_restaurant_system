### Chuỗi kiến trúc E-Commerce Order & Inventory System (NestJS + ALS + Outbox + CDC Debezium)

Hệ thống xử lý Đặt hàng (Orders) và Trừ kho (Inventory) bất đồng bộ chuẩn kiến trúc Microservices, giải quyết triệt để 2 bài toán lớn trong hệ thống phân tán:

- Dual-Write Problem: Đảm bảo dữ liệu đơn hàng và sự kiện (Event) được lưu atomic 100% trong một DB Transaction mà không cần truyền EntityManager/QueryRunner thủ công.
- Exactly-Once Processing: Đảm bảo Consumer xử lý sự kiện an toàn, chống lặp tin nhắn (Duplicate Messages) ngay cả khi Network bị nháy hay Rebalance Cluster.

### Tổng quan Kiến trúc System Flow

```Bash
[ Client ]
    │
    │ 1. POST /orders (Create Order)
    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ NestJS - Order Microservice                                            │
│  - ALS (AsyncLocalStorage) kích hoạt Context cho Request               │
│  - @Transactional() đóng gói OrderRepo & OutboxRepo trong 1 DB Tx      │
│  - Commit thành công vào PostgreSQL (bảng `orders` & `outbox_messages`)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    │ 2. Logical Replication Log (WAL)
                                    ▼
                      ┌──────────────────────────┐
                      │ PostgreSQL Database      │
                      └─────────────┬────────────┘
                                    │
                                    │ 3. Streaming WAL Changes
                                    ▼
                      ┌──────────────────────────┐
                      │ Debezium Connect Engine  │
                      │ (Outbox EventRouter SMT) │
                      └─────────────┬────────────┘
                                    │
                                    │ 4. Route to `outbox.event.Order`
                                    ▼
                      ┌──────────────────────────┐
                      │ Apache Kafka Broker      │
                      └─────────────┬────────────┘
                                    │
                                    │ 5. Consume Event
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ NestJS - Inventory Microservice                                        │
│  - IdempotentInterceptor kiểm tra Fast-Read trong `processed_events`   │
│  - Nếu MỚI: Trừ kho (`inventories`) + Lưu vết (`processed_events`)     │
│  - Nếu TRÙNG: Skip execution & ACK Kafka ngay lập tức                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Giải thích Chi tiết Từng Luồng Code Chạy (Step-by-Step Flow)

## 1. Luồng Producer: Đặt hàng & Tạo Outbox Event (Order Service)

- Khởi tạo AsyncLocalStorage Context:
  Khi Client gửi request POST /orders, middleware của nestjs-cls tạo ra một không gian lưu trữ riêng biệt (AsyncLocalStorage Context) gắn liền với luồng bất đồng bộ của Request đó.

- Kích hoạt Transaction Tự động qua @Transactional():
  Decorator @Transactional() trên OrdersService.createOrder() tự động mượn một EntityManager từ TypeORM và lưu nó vào ALS Context.

- Thao tác Database đúp (Dual Operations):
  - Lệnh orderRepository.save(order) ghi dữ liệu đơn hàng vào bảng orders.
  - Lệnh outboxRepository.save(outboxEvent) ghi sự kiện vào bảng outbox_messages.
  - Điểm đặc biệt: Nhờ ALS Adapter, cả 2 repository này tự nhận biết và dùng chung CÙNG MỘT Transaction từ ALS Context mà không cần lập trình viên phải truyền tx hay manager qua tham số.

- Commit & Rollback:
  Nếu cả 2 thao tác thành công -> Transaction COMMIT. Nếu có bất kỳ Exception nào -> Transaction ROLLBACK toàn bộ (Order không được tạo và Outbox Message cũng không sinh ra).

## 2. Luồng Capture & Routing Event: Debezium CDC -> Kafka

- Đọc WAL Log (No DB Polling Overhead):
  Ngay khi PostgreSQL COMMIT thành công, bản ghi outbox_messages mới được ghi trực tiếp vào file Write-Ahead Log (WAL) của PostgreSQL. Debezium Engine đọc file WAL này theo thời gian thực (độ trễ < 10ms)
- Thực thi SMT (Single Message Transform):
  Debezium sử dụng EventRouter plugin để nắn chỉnh dữ liệu:
  - Tự động bóc tách envelope cồng kềnh của CDC (before, after, op, ts_ms).
  - Chỉ giữ lại trường payload làm nội dung Message chính.
  - Đưa trường type (ORDER_CREATED) thành Kafka Record Header.
- Auto Topic Routing:
  Dựa trên cấu hình "transforms.outbox.route.topic.replacement": "outbox.event.${routedByValue}", Debezium tự động đọc cột aggregatetype (Order) và đẩy message thẳng vào Topic Kafka tên là outbox.event.Order.

## 3. Luồng Consumer & Chống trùng lặp: Inventory Service

- Tiêu thụ Event từ Kafka:
  NestJS Microservice (InventoryController) lắng nghe Topic outbox.event.Order thông qua @EventPattern('outbox.event.Order').
- Chạy qua IdempotentInterceptor (Filter Layer):
  Bắt lấy id của message (đóng vai trò là eventId duy nhất):
  - Fast-Check: Thực hiện Query vào bảng processed_events:
    SELECT 1 FROM processed_events WHERE event_id = $1 AND consumer_group = $2.
  - Nếu tìm thấy (Bản ghi trùng): Interceptor ghi log Cảnh báo [DUPLICATE DETECTED] và lập tức ngắt chuỗi xử lý (trả về null). Kafka nhận ACK thành công và không có logic nghiệp vụ nào bị chạy lại
  - Nếu chưa có (Bản ghi mới): Chuyển tiếp Request vào Handler nghiệp vụ handleOrderCreated().
- Thực thi Trừ kho & Lưu vết Atomic:
  - Handler gọi InventoryService.deductStock() để trừ số lượng sản phẩm trong bảng inventories.
  - Lưu event_id vào bảng processed_events.
  - Cả 2 thao tác này được bọc lại trong @Transactional() (ALS) của Consumer, cam kết trừ kho xong thì phải ghi được vết processed_events.

### Hướng dẫn Khởi chạy Hệ thống (Quick Start)

Bài toán thực tế: Hệ thống Đặt hàng & Trừ kho bất đồng bộ (E-Commerce Order System)

Yêu cầu nghiệp vụ:

- Khi người dùng đặt hàng (OrderService), hệ thống cần lưu thông tin đơn hàng và ghi nhận một sự kiện ORDER_CREATED.
- Toàn bộ thao tác lưu DB nghiệp vụ và lưu Event phải đảm bảo Atomicity (Tất cả hoặc Không gì cả) bằng cách áp dụng AsyncLocalStorage (ALS).
- Dùng CDC Debezium (PostgreSQL WAL) để lắng nghe thay đổi từ bảng Outbox và phát Event sang Kafka theo thời gian thực mà không làm tăng CPU/Tải của Database.
- Dịch vụ Kho (InventoryService) lắng nghe Event từ Kafka, áp dụng Idempotent Consumer để xử lý trừ kho an toàn, tránh bị lặp (Duplicate execution).

## Step 1 Checklist: Những việc cần chạy ngay

# 1. Khởi chạy Hạ tầng:

```YAML
version: "3.8"

services:
  # ==========================================
  # 1. POSTGRESQL (Enable Logical Replication WAL)
  # ==========================================
  postgres:
    image: postgres:16-alpine
    container_name: order_postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: order_db
    # Bật Logical Replication cho CDC Debezium qua command flags
    command:
      - "postgres"
      - "-c"
      - "wal_level=logical"
      - "-c"
      - "max_wal_senders=4"
      - "-c"
      - "max_replication_slots=4"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - cdc_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  # ==========================================
  # 2. APACHE KAFKA (KRaft mode - Non Zookeeper)
  # ==========================================
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: cdc_kafka
    restart: unless-stopped
    ports:
      - "9092:9092"
      - "9093:9093"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT'
      KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092'
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_PROCESS_ROLES: 'broker,controller'
      KAFKA_CONTROLLER_QUORUM_VOTERS: '1@kafka:29093'
      KAFKA_LISTENERS: 'PLAINTEXT://0.0.0.0:29092,CONTROLLER://0.0.0.0:29093,PLAINTEXT_HOST://0.0.0.0:9092'
      KAFKA_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT'
      KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER'
      KAFKA_LOG_DIRS: '/tmp/kraft-combined-logs'
      CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk'
    volumes:
      - kafka_data:/var/lib/kafka/data
    networks:
      - cdc_net

  # ==========================================
  # 3. DEBEZIUM CONNECT ENGINE
  # ==========================================
  debezium:
    image: debezium/connect:2.5
    container_name: cdc_debezium
    restart: unless-stopped
    ports:
      - "8083:8083" # REST API to register connectors
    environment:
      BOOTSTRAP_SERVERS: kafka:29092
      GROUP_ID: 1
      CONFIG_STORAGE_TOPIC: my_connect_configs
      OFFSET_STORAGE_TOPIC: my_connect_offsets
      STATUS_STORAGE_TOPIC: my_connect_status
      CONFIG_STORAGE_REPLICATION_FACTOR: 1
      OFFSET_STORAGE_REPLICATION_FACTOR: 1
      STATUS_STORAGE_REPLICATION_FACTOR: 1
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_started
    networks:
      - cdc_net

  # ==========================================
  # 4. REDIS (For Cache & Idempotency Check)
  # ==========================================
  redis:
    image: redis:7-alpine
    container_name: cdc_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    networks:
      - cdc_net

volumes:
  postgres_data:
  kafka_data:

networks:
  cdc_net:
    driver: bridge
```

```Bash
docker compose up -d
```

# 2. Cài đặt Package cho NestJS App:

Vào project NestJS và cài đặt các thư viện lõi cho ALS, TypeORM, Postgres và Kafka:

```Bash
npm i @nestjs/typeorm typeorm pg @nestjs-cls/transactional @nestjs-cls/transactional-adapter-typeorm nestjs-cls @nestjs/microservices kafkajs
```

## Step 2: Cấu hình Debezium Connector Auto Router

Tạo file chứa JSON payload cấu hình Debezium Connector để đăng ký với Debezium Connect Engine.

debezium/debezium-outbox-connector.json

```JSON
{
  "name": "order-outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "tasks.max": "1",
    "plugin.name": "pgoutput",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "postgres",
    "database.password": "secret",
    "database.dbname": "order_db",
    "topic.prefix": "cdc_order",
    "table.include.list": "public.outbox_messages",

    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.route.topic.replacement": "outbox.event.${routedByValue}",
    "transforms.outbox.table.fields.additional.placement": "type:header:eventType",
    "transforms.outbox.id.column": "id",
    "transforms.outbox.aggregate.type.column": "aggregatetype",
    "transforms.outbox.aggregate.id.column": "aggregateid",
    "transforms.outbox.payload.attribute.column": "payload"
  }
}
```

# 1. Nhóm Core & PostgreSQL Engine Configs

```JSON
"connector.class": "io.debezium.connector.postgresql.PostgresConnector",
"tasks.max": "1",
"plugin.name": "pgoutput",
"topic.prefix": "cdc_order",
"table.include.list": "public.outbox_messages"
```

Trong đó:

- **connector.class**: Chỉ định class Java chịu trách nhiệm kết nối với PostgreSQL Database
- **tasks.max: "1"**: Số lượng worker task chạy song song. Với PostgreSQL replication slot, bạn bắt buộc phải để là 1 vì PostgreSQL chỉ cho phép duy nhất một client đọc từ một Logical Replication Slot tại một thời điểm để bảo đảm thứ tự tuyến tính (Ordering guarantee).
- **plugin.name: "pgoutput"**:
  - Đây là Logical Decoding Plugin chính thức được PostgreSQL tích hợp sẵn từ phiên bản 10 trở đi.
  - Ưu điểm: Không cần cài thêm extension ngoài (như decoderbufs hay wal2json) vào Postgres container, giảm thiểu tối đa rủi ro gây panic/crash cho Database Engine.
- **topic.prefix: "cdc_order"**: Namespace đại diện cho cụm DB này trong Kafka Ecosystem. Debezium sẽ dùng prefix này để quản lý internal schemas và offset storage topics.
- **table.include.list: "public.outbox_messages"**:
  - White-list filter: Chỉ cho phép Debezium theo dõi duy nhất bảng outbox_messages.
  - Tối ưu: Loại bỏ hoàn toàn việc Debezium đọc và đẩy log từ các bảng nghiệp vụ khác (orders, users...), tránh làm lãng phí IOPS và tài nguyên mạng.

# 2. Nhóm Transform SMT (Single Message Transform) & Outbox Event Router

Đây là phần quan trọng nhất giúp biến Debezium từ một công cụ Sync DB thông thường thành một Event-Driven Messaging Gateway.

```JSON
"transforms": "outbox",
"transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter"
```

- Kích hoạt SMT Plugin: Khai báo biến transform tên là outbox sử dụng class EventRouter. Plugin này đảm nhận việc bóc tách Envelope cồng kềnh của Debezium (gồm before, after, source, op, ts_ms) để chỉ trích xuất đúng phần data nghiệp vụ cần thiết.

```JSON
"transforms.outbox.route.topic.replacement": "outbox.event.${routedByValue}"
```

Dynamic Topic Routing:

- Thay vì đẩy dữ liệu vào topic mặc định của Debezium (cdc_order.public.outbox_messages), cấu hình này sẽ định tuyến động Message sang Topic mới.
- Cụ thể: ${routedByValue} sẽ lấy giá trị từ cột aggregatetype (ví dụ: Order, Payment, User).
- Kết quả: Sự kiện được đẩy chính xác vào các Topic riêng biệt như outbox.event.Order hoặc outbox.event.Payment.

```JSON
"transforms.outbox.table.fields.additional.placement": "type:header:eventType"
```

- Header Enriched Mapping:
  - Đẩy giá trị từ cột type trong bảng DB (ví dụ: ORDER_CREATED, ORDER_CANCELLED) làm Kafka Record Header với key đặt tên là eventType.
  - Tác dụng: Phía Consumer (NestJS) có thể đọc nhanh Header để filter/route handler bằng Interceptor mà không cần tốn chi phí Parse toàn bộ Body JSON (Payload).

# 3. Nhóm Column Mapping Overrides

```JSON
"transforms.outbox.id.column": "id",
"transforms.outbox.aggregate.type.column": "aggregatetype",
"transforms.outbox.aggregate.id.column": "aggregateid",
"transforms.outbox.payload.attribute.column": "payload"
```

- Cơ chế Map Cột ORM vs Database:
  - Mặc định, Debezium Outbox Router tìm kiếm tên cột theo định dạng CamelCase chuẩn Java (aggregateType, aggregateId).
  - Tuy nhiên, các ORM như TypeORM hoặc PostgreSQL native thường đưa tên cột không bọc ngoặc kép về dạng chữ thường hoàn toàn (aggregatetype, aggregateid) trong Database Engine.
  - Việc chỉ định rõ các config này nhằm bắt buộc SMT map chính xác với tên cột thực tế trong Postgres System Catalog, tránh tình trạng Debezium báo lỗi IllegalArgumentException: Could not find column... khi vừa khởi chạy.

# 4. Tóm tắt Payload đầu ra trên Kafka Topic sau khi qua Config trên

Khi trong DB phát sinh 1 dòng Outbox mới, thay vì nhận một JSON CDC thô dài hàng trăm dòng, Kafka Consumer sẽ nhận được một Kafka Message cực kỳ gọn nhẹ:

- Kafka Topic: outbox.event.Order

- Kafka Key: <Value aggregateid cột của>

- Kafka Headers: eventType: ORDER_CREATED

- Kafka Payload (Value):

```JSON
{
  "orderId": "e4b2d312-70df-4f40-8b1e-97c9fa123456",
  "userId": "usr_9999",
  "amount": 250000,
  "items": [...]
}
```

## Step 3. Đăng ký Connector vào Debezium Engine

Sau khi container Debezium (localhost:8083) đã sẵn sàng (ở Step 1), mở Terminal mới và execute lệnh cURL để đăng ký Connector bằng file JSON vừa tạo:

```Bash
curl -i -X POST -H "Accept:application/json" -H "Content-Type:application/json" \
  http://localhost:8083/connectors/ \
  -d @debezium/debezium-outbox-connector.json
```

Đảm bảo Connector đã chuyển sang trạng thái RUNNING:

```Bash
curl -i -X GET http://localhost:8083/connectors/order-outbox-connector/status
```

Để tắt (dừng tạm thời) hoặc xóa hẳn (destroy) một Connector trên Kafka Connect/Debezium, bạn không dùng HTTP GET mà phải sử dụng HTTP PUT hoặc DELETE.

Dưới đây là các câu lệnh cURL chuẩn xác cho từng mục đích:

```Bash
curl -i -X PUT http://localhost:8083/connectors/order-outbox-connector/pause
```

Để bật lại (Resume):

```Bash
curl -i -X PUT http://localhost:8083/connectors/order-outbox-connector/resume
```

Xóa hẳn (Delete) Connector
Lệnh này sẽ hủy hoàn toàn Connector khỏi Debezium Cluster. Nếu muốn chạy lại sau đó, bạn phải thực hiện gửi lệnh POST khởi tạo từ đầu bằng file JSON:

```Bash
curl -i -X DELETE http://localhost:8083/connectors/order-outbox-connector
```

Khởi động lại (Restart) Connector
Nếu Connector gặp sự cố (State: FAILED), bạn dùng lệnh này để kích hoạt lại mà không cần xóa:

```Bash
curl -i -X POST http://localhost:8083/connectors/order-outbox-connector/restart
```

## Step 4: Test flow bắn HTTP Request tạo Order -> Verify CDC đập Event sang Kafka Topic.

```Bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "usr_9999",
    "amount": 250000,
    "items": [
      {
        "productId": "prod_keyboard_01",
        "quantity": 1,
        "price": 250000
      }
    ]
  }'
```

Kết quả mong đợi trả về từ NestJS API (HTTP 201 Created):

```JSON
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "userId": "usr_9999",
    "amount": 250000,
    "items": [
      {
        "productId": "prod_keyboard_01",
        "quantity": 1,
        "price": 250000
      }
    ],
    "status": "PENDING",
    "id": "e4b2d312-70df-4f40-8b1e-97c9fa123456",
    "createdAt": "2026-09-15T12:00:00.000Z",
    "updatedAt": "2026-09-15T12:00:00.000Z"
  }
}
```
