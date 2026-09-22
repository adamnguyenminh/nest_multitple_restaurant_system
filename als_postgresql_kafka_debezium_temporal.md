# Quá trình thiết lập hệ thống đặt bàn nhà hàng phân tán với NestJS, PostgreSQL, Kafka, Debezium, và Temporal

Dưới đây là tổng hợp toàn bộ bài học kinh nghiệm (Lessons Learned) từ quá trình thiết lập hệ thống đặt bàn nhà hàng phân tán với NestJS, PostgreSQL, Kafka, Debezium, và Temporal. Tất cả các vấn đề, nguyên nhân cốt lõi và giải pháp áp dụng đều được chi tiết hóa bên dưới:

## File docker_compose.yml

```yml
version: "3.8"

services:
  # ==========================================
  # 1. POSTGRESQL
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
      POSTGRES_HOST_AUTH_METHOD: scram-sha-256
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
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - cdc_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d order_db"]
      interval: 3s
      timeout: 3s
      retries: 10

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
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT"
      KAFKA_ADVERTISED_LISTENERS: "PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092"
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_PROCESS_ROLES: "broker,controller"
      KAFKA_CONTROLLER_QUORUM_VOTERS: "1@kafka:29093"
      KAFKA_LISTENERS: "PLAINTEXT://0.0.0.0:29092,CONTROLLER://0.0.0.0:29093,PLAINTEXT_HOST://0.0.0.0:9092"
      KAFKA_INTER_BROKER_LISTENER_NAME: "PLAINTEXT"
      KAFKA_CONTROLLER_LISTENER_NAMES: "CONTROLLER"
      KAFKA_LOG_DIRS: "/tmp/kraft-combined-logs"
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
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
      - "8083:8083"
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
  # 4. REDIS
  # ==========================================
  redis:
    image: redis:7-alpine
    container_name: cdc_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    networks:
      - cdc_net

  # ==========================================
  # 5. TEMPORAL SERVER
  # ==========================================
  temporal:
    image: temporalio/auto-setup:1.24.2
    container_name: cdc_temporal
    restart: unless-stopped
    ports:
      - "7233:7233"
    environment:
      - DB=postgres12_pgx
      - DB_PORT=5432
      - POSTGRES_SEEDS=postgres
      - POSTGRES_USER=postgres
      - POSTGRES_PWD=secret # <-- SỬA TẠI ĐÂY (bắt buộc là POSTGRES_PWD)
      - POSTGRES_DB=temporal
      - POSTGRES_VISIBILITY_DB=temporal_visibility
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - cdc_net

  # ==========================================
  # 6. TEMPORAL WEB UI (Port 8233)
  # ==========================================
  temporal-ui:
    image: temporalio/ui:2.28.0
    container_name: cdc_temporal_ui
    restart: unless-stopped
    ports:
      - "8233:8080" # Web UI tại http://localhost:8233
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_UI_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:8233
    depends_on:
      - temporal
    networks:
      - cdc_net

volumes:
  postgres_data:
  kafka_data:

networks:
  cdc_net:
    driver: bridge
```

## Đôi chút về temporal và temporal-ui

2 database này (chính xác là 2 Database riêng biệt chứa các bảng bên trong) được lưu trữ trực tiếp dưới đĩa cứng thông qua PostgreSQL container (order_postgres). Khi bạn chạy container temporalio/auto-setup, Temporal Server sẽ tự động khởi tạo 2 database này để phục vụ các mục đích cốt lõi sau:

### 1. Database temporal (Persistence Store)

Đây là Database lưu trữ trạng thái chính (Primary State Store) của Temporal Server. Nó đóng vai trò là "bộ nhớ bền vững" giúp Temporal đạt được đặc tính Durable Execution (chạy không bao giờ mất trạng thái).

Vai trò chính:

- Workflow Execution State: Lưu trữ trạng thái hiện tại của tất cả các Workflow (đang chạy, hoàn thành, bị lỗi, hoặc bị timeout).
- Event History: Lưu trữ toàn bộ lịch sử các sự kiện đã xảy ra (Event Sourcing), ví dụ: WorkflowStarted, ActivityScheduled, ActivityTaskCompleted, TimerStarted... Khi ứng dụng NestJS bị crash hoặc restart, Temporal sẽ đọc lại Event History này từ đĩa cứng để phục hồi chính xác trạng thái Workflow trước đó.
- Task Queues & Timers: Lưu danh sách các nhiệm vụ đang chờ Worker nhặt về xử lý (table-reservation-queue) và các bộ đếm thời gian bền vững (như lệnh await sleep('2 minutes') trong code của bạn).
- Locks & Namespaces: Quản lý metadata của namespace (mặc định là default) và cơ chế Distributed Lock nội bộ của Temporal.

### 2. Database temporal_visibility (Visibility Store)

Đây là Database phục vụ cho việc truy vấn và hiển thị (Search & Query Engine), chủ yếu được dùng bởi Temporal Web UI (http://localhost:8233).

Vai trò chính:

- Tìm kiếm và Lọc Workflows: Lưu trữ index các thông tin tổng quan của Workflow để bạn có thể search/filter nhanh trên UI theo WorkflowId, WorkflowType, StartTime, Status (Running, Completed, Failed...).
- Phân tách tải (Performance Optimization): Giúp việc người dùng mở Web UI hoặc thực hiện các câu lệnh tìm kiếm nâng cao (Search Attributes) không ảnh hưởng hay làm chậm (Lock) đến database chính temporal - nơi đang phải xử lý hàng nghìn giao dịch ghi Event History real-time.

### 3. Tóm lại mối quan hệ trong PostgreSQL của bạn

```Bash
PostgreSQL Container (order_postgres)
├── order_db             --> Database nghiệp vụ của NestJS (bảng restaurant_tables, outbox)
├── temporal             --> DB lưu Trạng thái + Lịch sử Event Sourcing của Temporal Workflow
└── temporal_visibility  --> DB phục vụ Tìm kiếm & Hiển thị cho Temporal Web UI (localhost:8233)
```

Cả 3 Database này đều nằm chung trong Postgres Volume (postgres_data) trên ổ đĩa cứng của bạn. Vì vậy, khi bạn thực thi docker compose down -v, toàn bộ lịch sử chạy Workflow trên Temporal UI lẫn dữ liệu đặt bàn của NestJS sẽ sạch bóng.

## Một số lưu ý lỗi đã được khắc phục

### 1. Temporal Client & gRPC Connection Error

Vấn đề / Lỗi:

- Lỗi TypeScript: Object literal may only specify known properties, and 'target' does not exist in type 'ConnectionOptions'.
- Lỗi Runtime: Error: Failed to connect before the deadline từ @grpc/grpc-js.

Nguyên nhân cốt lõi:

- Trong các phiên bản SDK mới của Temporal (@temporalio/client), thuộc tính khai báo gRPC host là address thay vì target.
- Lỗi deadline xảy ra khi NestJS không thể mở kết nối gRPC tới cổng 7233 do container Temporal Server bị crash loop ở phía backend.

Tại sao áp dụng giải pháp này?

- Đổi thuộc tính thành address: 'localhost:7233' trong Connection.connect() giúp khớp đúng interface ConnectionOptions của Temporal SDK. Cổng 7233 là gRPC endpoint chuẩn để SDK truyền nhận lệnh điều phối workflow.

### 2. Temporal Server Driver & Environment Mismatch

Vấn đề / Lỗi:

- Log Temporal Server: Unsupported driver specified: 'DB=postgres'.
- Log Temporal UI: TEMPORAL_ADDRESS is not set... kèm lỗi HTTP 500 Internal Error khi truy cập port 8233.

Nguyên nhân cốt lõi:

- Image temporalio/auto-setup không chấp nhận chuỗi driver generic postgres.
- Tên biến môi trường truyền mật khẩu PostgreSQL trong image này là POSTGRES_PWD chứ không phải POSTGRES_PASSWORD. Biến POSTGRES_PASSWORD bị rỗng dẫn đến authentication rỗng.

Tại sao áp dụng giải pháp này?

- Đổi DB=postgres12_pgx để kích hoạt driver Native PGX tương thích chính xác với PostgreSQL 16.
- Đổi thành POSTGRES_PWD=secret để script auto-setup đọc đúng password và thực thi script khởi tạo Database Schema cho Temporal (temporal và temporal_visibility).
- Thêm biến TEMPORAL_UI_ADDRESS=temporal:7233 cho service temporal-ui để Web UI kết nối trực tiếp vào container Temporal Server qua mạng nội bộ Docker (cdc_net).

### 3. PostgreSQL Authentication & Volume Conflict (SASL Auth / 28P01)

Vấn đề / Lỗi:

- Log: failed SASL auth (FATAL: password authentication failed for user "postgres" (SQLSTATE 28P01)).

Nguyên nhân cốt lõi:

- PostgreSQL 16 mặc định dùng cơ chế mã hóa mật khẩu scram-sha-256.
- Khi sửa biến môi trường password trong docker-compose.yml, Docker Volume gắn kèm (postgres_data) không tự động cập nhật password nếu volume đã được khởi tạo trước đó.
- Thêm các câu lệnh CREATE DATABASE temporal; thủ công vào file init.sql gây xung đột hoặc lỗi đè quyền khi script auto-setup của Temporal khởi chạy.

Tại sao áp dụng giải pháp này?

- Khai báo POSTGRES_HOST_AUTH_METHOD: scram-sha-256 ở Postgres container để đồng bộ phương thức xác thực.
- Thực hiện docker compose down -v (hoặc docker volume prune -f) để xóa triệt để Volume đĩa cứng cũ, ép PostgreSQL khởi tạo lại mật khẩu mới cùng file init.sql chuẩn ngay từ đầu.

### 4. Bất đồng bộ Vòng đời Temporal Worker trong NestJS

Vấn đề / Lỗi:

- API trả về "Yêu cầu đặt bàn đã được tiếp nhận", nhưng kiểm tra Database không hề thấy thay đổi dữ liệu hay bản ghi Outbox.

Nguyên nhân cốt lõi:

- ITableActivities chỉ là một Interface ở tầng compile-time. NestJS Controller gửi lệnh đẩy Workflow vào Task Queue của Temporal Server thành công, nhưng chưa có Temporal Worker nào lắng nghe Task Queue đó để nhặt Activity về chạy.

Tại sao áp dụng giải pháp này?

- Tạo một TemporalWorkerService thực thi Worker.create() trong lifecycle onModuleInit() của NestJS.
- Đăng ký danh sách hoạt động (activities) bằng cách bind context service: this.tableActivities.reserveTableActivity.bind(this.tableActivities).
- Lưu ý quan trọng: Không dùng await worker.run() trong onModuleInit() để tránh làm treo (block) tiến trình khởi động HTTP Server của NestJS.

### 5. Khóa bi quan và Mất Context Transaction trong Tiến trình Ngầm (ALS / CLS)

Vấn đề / Lỗi:

- Lỗi: PessimisticLockTransactionRequiredError: An open transaction is required for pessimistic lock xuất hiện tại SelectQueryBuilder.executeEntitiesAndRawResults.

Nguyên nhân cốt lõi:

- @Transactional() (dựa trên AsyncLocalStorage - ALS) mặc định bám vào HTTP Request Context do Guard/Middleware tạo ra. Tiến trình ngầm của Temporal Worker gọi trực tiếp Activity mà không qua HTTP Request, khiến ALS Context bị rỗng và @Transactional() bị bỏ qua.
- Dù đã tạo ALS context bằng cls.run(), việc dùng this.tableRepository.createQueryBuilder() trực tiếp vẫn sẽ lấy Connection từ Pool chung (ngoài Transaction) thay vì Connection đang giữ Transaction Lock.

Tại sao áp dụng giải pháp này?

- Bọc hàm thực thi Activity trong this.cls.run(...) tại file table.activities.ts để chủ động tạo ALS Context cho Worker.
- Inject TransactionHost<TransactionalAdapterTypeOrm> vào TablesService và trích xuất Repository qua this.txHost.tx.getRepository(Table). Cách này bắt buộc QueryBuilder sử dụng chính xác EntityManager/Connection chứa câu lệnh BEGIN transaction hiện tại, cho phép thực thi khóa bi quan pessimistic_write (FOR UPDATE SKIP LOCKED) an toàn và triệt để.

## Chuyên sâu về Bài toán Delayed Scheduler: BullMQ (Redis) vs. Temporal.io

Yêu cầu "Đợi 30 phút hoặc 7 ngày sau thì kích hoạt Action" (ví dụ: gửi mail nhắc nhở, kiểm tra no-show, tự động hủy đơn, tự động nhắc lại sau 1 tuần) là dạng bài toán Scheduled / Delayed Tasks với State Management.

Khi kết hợp với chuỗi kiến trúc NestJS + ALS + Outbox Pattern + CDC (Debezium), tầng Scheduler sẽ nằm ở phía sau Event Stream để quản lý yếu tố thời gian và sự kiện trong tương lai.

## Phân tích chi tiết: BullMQ (Redis)

BullMQ là một thư viện Node.js/TypeScript chạy trên nền Redis (sử dụng Redis Data Structures như ZSET, Hashes, Streams), rất thích hợp cho các ứng dụng NestJS/Node.js.

### 1. Cơ chế Delayed Job của BullMQ

Dữ liệu chính: BullMQ sử dụng Redis ZSET (Sorted Set) cho các Delayed Jobs.

- Member: jobId
- Score: timestamp dự kiến thực thi (ví dụ: NOW() + 30m hoặc NOW() + 7 days).

Luồng hoạt động:

- Khi khởi tạo Job với option { delay: 1800000 } (30 phút) hoặc { delay: 604800000 } (7 ngày), BullMQ lưu thông tin Job vào Hash và đưa jobId vào Redis ZSET với Score là Epoch Time (ms) lúc Job sẽ bùng nổ (fired).
- Một vòng lặp nội bộ / script Lua của BullMQ Poller sẽ liên tục truy vấn Redis (ZRANGEBYSCORE).
- Khi Score <= CurrentTimestamp, Job được chuyển từ trạng thái delayed sang waiting hoặc active để Worker kéo về xử lý.

```TypeScript
// Thêm Delayed Job vào BullMQ (Ví dụ: Nhắc nhở sau 7 ngày)
import { Queue } from 'bullmq';

const reservationQueue = new Queue('reservation_tasks', { connection: redisConfig });

async function scheduleReminder(reservationId: string, bookingTimeMs: number) {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  await reservationQueue.add(
    'send_reminder_email',
    { reservationId },
    {
      delay: SEVEN_DAYS_MS,
      jobId: `reminder_${reservationId}`, // Ánh xạ 1:1 với Business ID để phục vụ Hủy/Cập nhật
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    },
  );
}
```

### 2. Kịch bản Hủy / Cập nhật Job (Cancellation Pattern)

Trong bài toán đặt bàn: Nếu khách Check-in đúng giờ, ta cần xóa ngay Job nhắc nhở 30 phút để tránh gửi mail/SMS nhầm:

```TypeScript
async function cancelReminder(reservationId: string) {
  const jobId = `no_show_${reservationId}`;
  const job = await reservationQueue.getJob(jobId);
  if (job) {
    await job.remove(); // Xóa Job khỏi ZSET của Redis
  }
}
```

### 3. Thách thức khi dùng BullMQ cho thời gian dài (7 ngày)

**Lưu trữ trên RAM (Redis Memory Usage):**

- Nếu có hàng triệu đơn đặt hàng treo trong 7 ngày, việc giữ toàn bộ metadata của Job trong Redis RAM sẽ rất tốn kém tài nguyên.

**Xóa/Rơi mất dữ liệu Redis (Persistence Risk):**

- Nếu Redis không bật AOF (Append Only File) chuẩn chỉnh hoặc gặp sự cố OOM (Out Of Memory) Eviction Policy, các Job delayed trong 7 ngày có thể bị rụng.

**Timer Drift & Cluster Oversharding:**

- Redis Cluster cần đảm bảo Key của Hash và Key của ZSET nằm cùng Slot (sử dụng Hash Tags như {reservation_tasks}:jobId).

## Phân tích chi tiết: Temporal.io

Temporal.io là một nền tảng Durable Execution Engine (Mã nguồn mở) được thiết kế cho các quy trình nghiệp vụ phức tạp, kéo dài hàng giờ, hàng tháng hoặc hàng năm (Long-running Workflows).

### 1. Cơ chế Timer & State Persistence của Temporal

- Temporal không dùng Polling hay lưu RAM đơn thuần.
- Nó sử dụng cơ chế Event Sourcing / Workflow History State.
- Khi bạn khai báo await sleep('7 days') trong Workflow, Temporal Engine ghi nhận một sự kiện TimerStarted vào Persistence DB (PostgreSQL, Cassandra, hoặc MySQL) và giải phóng hoàn toàn bộ nhớ CPU/RAM của Worker.
- Sau 7 ngày, Temporal Engine tự động kích hoạt sự kiện TimerFired, khôi phục (Resume) đúng trạng thái code của Worker để chạy tiếp dòng code tiếp theo.

```TypeScript
// Temporal Workflow Definition (TypeScript SDK)
import { sleep, defineSignal, setHandler } from '@temporalio/workflow';
import * createActivities from './activities';

const { sendEmailReminder, sendNoShowSMS } = createActivities({
  startToCloseTimeout: '1 minute',
});

// Signal nhận sự kiện Khách đã Check-in
export const checkedInSignal = defineSignal('checkedIn');

export function reservationWorkflow(reservationId: string): void {
  let isCheckedIn = false;

  // Lắng nghe Signal Check-in từ API
  setHandler(checkedInSignal, () => {
    isCheckedIn = true;
  });

  // Task 1: Đợi 30 phút kiểm tra No-Show
  await sleep('30 minutes');

  if (!isCheckedIn) {
    await sendNoShowSMS(reservationId);
  } else {
    // Task 2: Đợi thêm đến ngày đặt (vd: 7 ngày sau) để gửi Reminder Email
    await sleep('6.5 days');
    await sendEmailReminder(reservationId);
  }
}
```

### 2. Lợi thế của Temporal khi delay 7 ngày

- Durable Execution: Dù tất cả API Server / Worker Node bị sập, restart hoặc crash giữa chừng trong 7 ngày, sau khi bật lại, Workflow vẫn chạy tiếp đúng mốc thời gian còn lại mà không mất dữ liệu hay bị lặp lại bước cũ.
- Tiết kiệm tài nguyên tuyệt đối: Khi đang sleep, Workflow tốn 0% CPU và 0% RAM. Metadata nằm an toàn trong DB disk.
- Phù hợp với Workflow có sự kiện biến động: Cho phép hủy, tạm dừng, cập nhật thời gian chờ bằng Signals / Queries / Cancellation Scopes cực kỳ dễ dàng bằng code imperative.

### 3. Bảng so sánh chuyên sâu (BullMQ vs. Temporal.io)

| Tiêu chí                            | BullMQ (Redis)                                                         | Temporal.io                                                                   |
| :---------------------------------- | :--------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| **Bản chất**                        | Lightweight Task Queue                                                 | Heavy-duty Workflow Engine                                                    |
| **Trường hợp lý tưởng**             | Delay ngắn (Vài giây, 30 phút, vài giờ).                               | Delay dài (Vài ngày, 7 ngày, vài tháng) hoặc quy trình đa bước phức tạp.      |
| **Khả năng khôi phục (Resilience)** | Phụ thuộc cấu hình Persistence của Redis (RDB/AOF). Dễ bị mất nếu OOM. | High Durability. Trạng thái Workflow được ghi xuống DB (Postgres/Cassandra).  |
| **Tốn tài nguyên (RAM/Storage)**    | Tốn RAM Redis nếu hàng triệu Delayed Jobs nằm chờ 7 ngày.              | Chỉ tốn Storage Disk trên DB. Worker không tốn RAM/CPU khi Timer đang chờ.    |
| **Xử lý Hủy / Thay đổi lịch**       | Phải truy vấn xóa jobId thủ công trên Queue.                           | Hỗ trợ Cancel Scope, Timer Interrupt, Signal natively trong code.             |
| **Chi phí hạ tầng & Độ phức tạp**   | Rất thấp. Chỉ cần có Redis Instance.                                   | Cao hơn. Cần dựng Temporal Cluster (Server, DB Persistence, UI, Admin tools). |
| **Xử lý Retry / Backoff**           | Cấu hình cấp Job (attempts, backoff).                                  | Cấu hình chi tiết tới từng Activity độc lập trong Workflow.                   |

## Đề xuất Kiến trúc cho Hệ thống

```Bash
[ NestJS API ] (ALS + Transaction)
      │
      ├─► [ PostgreSQL (Orders/Reservations + Outbox) ]
      │             │
      │       (PostgreSQL WAL)
      │             │
      │             ▼
      │      [ Debezium CDC ]
      │             │
      │             ▼
      │      [ Kafka Broker ]
      │             │
      └─────────────┴──────────────┐
                                   │
                     ┌─────────────┴─────────────┐
                     │ (Tùy chọn quy mô/sử dụng) │
                     ▼                           ▼
            [ BullMQ (Redis) ]           [ Temporal.io ]
        (Phù hợp Delay 30 phút)      (Phù hợp Delay 7 ngày)
```

**Lựa chọn BullMQ khi:**

- Luồng nghiệp vụ đơn giản: Đặt hàng -> Đợi 30 phút -> Kiểm tra trạng thái -> Gửi Mail/SMS
- Hệ thống đã có sẵn Redis Cluster dung lượng đủ lớn và bạn muốn triển khai nhanh, không muốn dựng thêm cluster hạ tầng phức tạp.

**Lựa chọn Temporal.io khi:**

- Quy trình kéo dài nhiều ngày (như nhắc nhở trước 7 ngày, gửi thông báo sau 14 ngày, đòi nợ định kỳ theo kỳ hạn).
- Nghiệp vụ phức tạp có nhiều nhánh rẽ (ví dụ: Đợi 30 phút -> Nếu chưa checkin thì gửi SMS -> Đợi tiếp 24h nếu vẫn không có phản hồi thì tự động hoàn tiền/hủy đơn).
- Cần kiểm vết Audit Trail chính xác 100% cho mọi hành động xảy ra trong suốt tuần.

# Nghiên cứu thêm

Để hiểu vì sao Temporal có thể đóng băng Workflow mà hoàn toàn không tốn 0% RAM hay CPU của Worker Node trong suốt 7 ngày hay cả vài năm, chúng ta cần đi sâu vào cơ chế kiến trúc nội tại của Temporal: Event Sourcing, Separation of Execution & State, và Workflow Replay Engine.

## 1. Nguyên lý Kiến trúc: Chia tách Worker và Temporal Server (State vs. Execution)

Nhiều hệ thống lập trình truyền thống (hoặc thư viện Job Queue như BullMQ) duy trì trạng thái chờ bằng một trong hai cách:

- In-Memory Timer (setTimeout): Giữ Process/Thread ở trạng thái sleep. Thread này liên tục chiếm dụng bộ nhớ RAM để giữ Stack Trace và tốn CPU Context Switching.
- Polling (setInterval / Redis ZSET): Worker hoặc Redis Cron liên tục thực hiện truy vấn DB/Redis định kỳ để xem có Job nào đến hạn chưa.

**Temporal tiếp cận hoàn toàn khác nhờ phân tách hai tầng độc lập:**

```Bash
┌────────────────────────────────────────────────────────┐
 │                   TEMPORAL CLUSTER                     │
 │  (State Store - Lưu trữ History & Timers vào DB Disk)   │
 └──────────────────────────┬─────────────────────────────┘
                            │ (gRPC Event Push khi hết giờ)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                    WORKER NODE                         │
 │     (Stateless Execution Engine - Chạy code TypeScript)│
 └────────────────────────────────────────────────────────┘
```

- Temporal Cluster (Server): Đảm nhiệm việc quản lý Trạng thái (State), Thời gian (Timer) và Lưu trữ (History Persistence Engine).
- Worker Node (Code NestJS của bạn): Là một Node Stateless (không giữ trạng thái). Nó chỉ đơn thuần là cỗ máy tính toán nhận các chỉ thị (Tasks) từ Temporal Server qua kết nối gRPC, thực thi rồi trả kết quả.

## 2. Chuyện gì xảy ra dưới nền tảng (Under the Hood) khi dòng await sleep('7 days') chạy?

```Bash
Hãy theo dõi chính xác chuỗi sự kiện diễn ra từng bước (Step-by-step):

[Worker Node]                                       [Temporal Server & DB]
      │                                                       │
      ├─── 1. Chạy tới `await sleep('7 days')`                │
      │                                                       │
      ├─── 2. Bắn gRPC Command: CreateTimer(7 days) ─────────►│
      │                                                       │ 3. Ghi Event `TimerStarted`
      │                                                       │    vào DB Disk (Postgres/Cassandra)
      │◄── 4. Nhận ACK thành công ────────────────────────────┤
      │                                                       │ 5. Đặt hẹn giờ trong
      │                                                       │    Distributed Timer Service
      │
      ▼
6. GARBAGE COLLECTION!
   - Xóa Workflow Instance khỏi RAM
   - Giải phóng Event Loop & CPU Thread
   (RAM = 0 MB, CPU = 0%)
                                                              │
                                                        ... 7 NGÀY SAU ...
                                                              │
                                                              │ 8. Timer bùng nổ (Fire)!
                                                              │    Ghi Event `TimerFired` vào DB
      │◄── 9. Server đẩy Task khôi phục sang Worker ──────────┤
      │
 10. REPLAY ENGINE:
     - Worker nạp lại Event History từ DB
     - Chạy lại nhanh (Replay) qua dòng `sleep`
     - Chạy tiếp code phía sau `sleep`
```

**Bước 1: Yêu cầu tạo Timer (Timer Delegation)**

Khi câu lệnh await sleep('7 days') được gọi trong mã TypeScript của Worker:

- Worker không gọi hàm setTimeout() của Node.js.
- SDK của Temporal sẽ intercepts lệnh này và gửi một request gRPC dạng: ScheduleDecision: StartTimer(duration: 7 days) lên Temporal Server.

**Bước 2: Temporal Server lưu vết xuống đĩa cứng (Persistence)**

Temporal Server nhận request và thực hiện 2 thao tác:

- Ghi thêm một sự kiện mới TimerStarted vào lịch sử giao dịch (Event History) của Workflow đó nằm trong cơ sở dữ liệu đĩa cứng (PostgreSQL / Cassandra / MySQL).
- Đăng ký mốc thời gian hết hạn (ExpirationTime = Now + 7 days) vào Distributed Timer Service của Server (sử dụng cấu trúc dữ liệu Time-Wheel hoặc Sorted Index trên DB Disk).

**Bước 3: Worker tiến hành Garbage Collection (Xóa hoàn toàn khỏi RAM)**

Ngay khi Temporal Server gửi phản hồi xác nhận (ACK) rằng sự kiện TimerStarted đã được ghi vào DB an toàn:

- Worker Node tiến hành tiêu hủy (Evict) đối tượng Workflow Instance khỏi Bộ nhớ RAM.
- Bộ dọn rác (Garbage Collector của V8/Node.js) giải phóng toàn bộ Variables, Closure, Stack Frame liên quan đến Workflow đó.
- Kết quả: Trên Worker Node, Workflow đó không còn bất kỳ một byte RAM nào tồn tại. Thread CPU hoàn toàn tự do để phục vụ các Request/Tasks khác.

## 3. Sau 7 ngày, làm sao Worker biết để chạy tiếp? (Cơ chế Replay & Event Sourcing)

Sau đúng 7 ngày (168 giờ):

**Server kích hoạt Event:**

- Distributed Timer Service của Temporal Server phát hiện đến giờ hẹn. Server ghi thêm một event mới là TimerFired vào Event History trong DB.

**Server đẩy Task xuống Worker:**

- Temporal Server tạo một WorkflowTask và đẩy qua gRPC tới Worker đang rảnh rỗi.

**Cơ chế Workflow Replay (Chạy phục hồi trạng thái):**

- Worker nhận được Task kèm theo Toàn bộ Lịch sử Sự kiện (Event History) của Workflow từ Server.
- Worker khởi tạo lại một Workflow Instance sạch trên RAM và bắt đầu chạy lại (Replay) từ dòng code đầu tiên.
- Phép thuật Replay xảy ra tại đây:
  - Khi code Replay chạy đến dòng await sleep('7 days'), SDK kiểm tra Event History và thấy: "À, đã có event TimerFired tương ứng trong History rồi!"
  - SDK lập tức trả về kết quả thành công cho hàm sleep mà không block code một milli-giây nào nữa.
- Mã lệnh lập tức vượt qua dòng await sleep('7 days') và nhảy thẳng xuống dòng tiếp theo (ví dụ: sendReminderEmail()).

## 4. So sánh Mô hình Bộ nhớ (Memory Profile) giữa BullMQ và Temporal.io

| Tiêu chí                                         | BullMQ (Redis)                                              | Temporal.io                                                                                 |
| :----------------------------------------------- | :---------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **Bản chất bộ nhớ**                              | RAM-bound (Lưu trên Memory của Redis)                       | Disk-bound (Lưu trên Ổ đĩa cứng DB của Cluster)                                             |
| **RAM tiêu tốn cho 1,000,000 Jobs "ngủ" 7 ngày** | ~500 MB - 2 GB RAM (Redis Hash + ZSET metadata cho 1M keys) | 0 MB RAM trên Worker Node. 0 MB RAM trên Temporal Server (chỉ tốn dung lượng đĩa cứng DB)   |
| **Xử lý khi Worker Restart**                     | Cần Worker duy trì Poller để check ZSET                     | Worker vô tư restart, crash, scale up/down. Trạng thái Workflow được Replay lại nguyên vẹn. |
| **Giới hạn số lượng Timer hoãn**                 | Bị giới hạn bởi dung lượng RAM của Redis Server.            | Bị giới hạn bởi dung lượng đĩa cứng (Disk Storage - rẻ hơn RAM hàng chục lần).              |

## 5. Tóm lại

Temporal khẳng định tốn 0% RAM/CPU trong thời gian hoãn vì:

- Không giữ Thread/Process ở trạng thái treo (sleep).
- Ủy quyền toàn bộ việc đếm giờ (Timer Management) cho Temporal Server lưu trữ dưới đĩa cứng DB.
- Giải phóng hoàn toàn (Evict) Workflow khỏi bộ nhớ RAM của Worker Node ngay sau khi đăng ký Timer thành công.
- Sử dụng cơ chế Event Sourcing Replay để dựng lại trạng thái code khi đếm giờ kết thúc.
