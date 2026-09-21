# Tìm hiểu về debezium

## 1. Debezium là gì?

Debezium là một nền tảng mã nguồn mở chuyên về Change Data Capture (CDC).

Thay vì hoạt động ở tầng ứng dụng (Application Layer), Debezium kết nối trực tiếp với nhật ký giao dịch (Transaction Logs) ở tầng lưu trữ đĩa cứng của Hệ quản trị cơ sở dữ liệu (Database Engine) — chẳng hạn như WAL (Write-Ahead Logging) của PostgreSQL hay Binlog của MySQL. Từ đó, nó phát hiện tức thì mọi thao tác ghi, sửa, xóa (INSERT, UPDATE, DELETE) trên các bảng dữ liệu và biến các thay đổi này thành một chuỗi sự kiện (Event Stream) để phát ra các Message Broker như Apache Kafka.

## 2. Nguyên nhân Debezium tồn tại (Tại sao lại cần nó?)

Để hiểu sự tồn tại của Debezium, cần nhìn vào lỗi hệ thống kinh điển khi phát triển ứng dụng Microservices hoặc Event-Driven Architecture: Lỗi "Dual-Write" (Ghi kép).

Kịch bản lỗi "Dual-Write"
Giả sử ứng dụng của bạn cần lưu đơn hàng vào Database và bắn sự kiện OrderCreated sang Kafka để dịch vụ Trừ Kho / Gửi Mail xử lý.

```TypeScript
await orderRepository.save(order); // (1) Lưu Database thành công
await kafkaClient.emit('order_created', order); // (2) Bắn sự kiện sang Kafka
```

- Vấn đề: Nếu bước (1) thành công, nhưng trước/trong bước (2) mạng bị lag, Kafka sập, hoặc Process của ứng dụng bị sập (Out of Memory/Crash)... dữ liệu đơn hàng đã lưu vào DB nhưng sự kiện không bao giờ được gửi đi. Hệ thống rơi vào trạng thái mất nhất quán dữ liệu nghiêm trọng.

**Giải pháp cũ và những bất cập**

Để sửa lỗi trên, người ta hay áp dụng Transactional Outbox Pattern kết hợp với Polling (@Cron):

- Lưu đơn hàng và ghi một dòng Event vào bảng outbox_messages trong cùng một DB Transaction.
- Chạy một Cronjob định kỳ: SELECT \* FROM outbox_messages WHERE processed = false rồi đẩy sang Kafka.
  - Nhược điểm của Polling:
    - Hành hạ Database: Câu lệnh SELECT liên tục gây tốn CPU, tài nguyên Disk I/O và tranh chấp khóa (Lock).
    - Độ trễ cao (Latency): Phụ thuộc vào chu kỳ Cronjob (ví dụ: quét 5s/lần) nên không đáp ứng được tính Real-time.

**Debezium xuất hiện để giải quyết hoàn hảo vấn đề này**

Debezium kết hợp với Outbox Pattern tạo thành cơ chế CDC Outbox:

- Đọc biến động dữ liệu trực tiếp từ Transaction Log trên đĩa cứng (WAL/Binlog) mà không gửi bất kỳ câu query nào làm nặng Database Engine.
- Đạt độ trễ tiệm cận Real-time (thường là dưới vài mây/milisecond, ví dụ lag chỉ khoảng ~800 bytes).

## 3. Debezium được sử dụng vào mục đích gì?

- Trích xuất sự kiện thay đổi dữ liệu (Streaming Data Changes): Biến cơ sở dữ liệu quan hệ truyền thống thành nguồn phát sự kiện liên tục.
- Định tuyến và biến đổi Message (Event Routing & SMT): Tự động bóc tách envelope phức tạp của CDC thành payload nghiệp vụ gọn nhẹ và phân phối chính xác tới các Topic Kafka tương ứng (ví dụ: outbox.event.Order, outbox.event.Payment).
- Đồng bộ hóa dữ liệu phi tập trung (Data Synchronization): Cập nhật dữ liệu từ Database chính sang các Search Engine (Elasticsearch), Cache (Redis), hoặc Data Warehouse mà không làm gián đoạn luồng xử lý chính.

## 4. Những bài toán thực tế cụ thể cần dùng Debezium

**Hệ thống Thương mại Điện tử / Đặt hàng (E-Commerce High-Traffic):**

- Bài toán: Người dùng nhấn "Đặt hàng". Ứng dụng chỉ cần ghi dữ liệu đơn hàng và sự kiện Outbox trong 1 Transaction.
- Ứng dụng Debezium: Bắt log WAL ngay lập tức để đẩy Event sang Kafka. Các dịch vụ độc lập như Trừ kho, Tích điểm, Gửi SMS/Email, Tạo đơn vận chuyển sẽ tiêu thụ Event này để xử lý bất đồng bộ.

**Fintech, Ví điện tử và Hệ thống Ngân hàng:**

- Bài toán: Cần đảm bảo tính nhất quán tài chính tuyệt đối (ACID) khi biến động số dư.
- Ứng dụng Debezium: Stream các giao dịch tài chính sang Hệ thống Báo cáo Phân tích (Data Warehouse) và Hệ thống Phát hiện Gian lận (Fraud Detection) theo thời gian thực mà không gây cản trở hay giảm hiệu năng luồng thanh toán.

**Bài toán Chuyển đổi từ Monolith sang Microservices (Strangler Fig Pattern):**

- Bài toán: Bạn muốn tách dần một hệ thống cũ (Monolith) sang nhiều Microservices mới mà không muốn chỉnh sửa quá nhiều vào mã nguồn của hệ thống cũ.
- Ứng dụng Debezium: Đóng vai trò lắng nghe sự thay đổi ở Database Monolith cũ và sync dữ liệu Real-time sang DB của các Microservices mới.

## 5. Thiếu Debezium thì hệ thống sẽ ra sao?

| Tiêu chí                            | Có Debezium (CDC Outbox)                                                    | Thiếu Debezium (Dùng Dual-Write hoặc Polling Cronjob)                                                  |
| :---------------------------------- | :-------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **Tính nhất quán dữ liệu**          | ACID tuyệt đối. Đảm bảo sự kiện chắc chắn được gửi đi nếu DB ghi thành công | Dễ rơi vào trạng thái mất nhất quán do lỗi Dual-Write (DB ghi thành công nhưng Broker ngắt kết nối)    |
| **Tải trên Database (DB Overhead)** | Near Zero. Đọc gián tiếp từ WAL/Binlog trên đĩa cứng                        | Rất cao. Đội ngũ phải chạy các lệnh SELECT liên tục, gây ngốn CPU/RAM và nảy sinh hiện tượng Lock bảng |
| **Độ trễ xử lý (Latency)**          | Real-time (< 10 - 50ms).                                                    | Chậm. Phụ thuộc vào chu kỳ quét Cronjob (vài giây đến vài phút)                                        |
| **Khả năng mở rộng (Scalability)**  | Rất cao. Giảm tải tối đa cho cả ứng dụng chính lẫn Database                 | DB chính dễ trở thành điểm nghẽn (Bottleneck) khi lưu lượng truy cập tăng đột biến.                    |

## 6. Những giới hạn / nhược điểm

Mặc dù Debezium kết hợp với Change Data Capture (CDC) là một giải pháp hàng đầu để giải quyết triệt để bài toán Dual-Write, độ trễ tiệm cận Real-time và tối ưu tải Database, nhưng nó không phải là "viên đạn bạc" (silver bullet). Trong thực tế triển khai ở quy mô Production, Debezium bộc lộ những giới hạn, nhược điểm và độ phức tạp mà đội ngũ phát triển bắt buộc phải đánh đổi hoặc tìm cách kiểm soát:

### 1. Hạ tầng phức tạp & Chi phí vận hành cao (Operational Complexity)

- Gắn chặt với Kafka Ecosystem: Debezium vận hành chuẩn xác nhất khi chạy trên nền tảng Kafka Connect. Điều này bắt buộc hệ thống phải kéo theo hàng loạt component cồng kềnh: Apache Kafka, Zookeeper (hoặc KRaft), Kafka Connect Cluster, Schema Registry.
- Đường cong học tập (Learning Curve) dốc: Đội ngũ DevOps/SRE và Backend không chỉ cần giỏi ứng dụng/Database mà còn phải am hiểu sâu về Kafka Connect configuration, JMX Metrics, cách tuning JVM cho Connector, cũng như kiến thức quản trị Transaction Log ở cấp độ hệ điều hành (WAL cho Postgres, Binlog cho MySQL).

### 2. Rủi ro tràn ổ cứng Database do "Replication Lag"

Đây là nhược điểm sinh tử của cơ chế Logical Replication:

- Cơ chế hoạt động: PostgreSQL hay MySQL duy trì các Replication Slot để theo dõi chỉ số LSN (Log Sequence Number) – vị trí cuối cùng Debezium đã đọc. Database bắt buộc phải giữ lại toàn bộ file WAL/Binlog trên đĩa cứng cho đến khi Debezium xác nhận (confirm/flush) đã tiêu thụ xong.
- Thảm họa Tràn đĩa (Disk Full): Nếu Debezium bị sập, bị nghẽn mạng, hoặc rơi vào vòng lặp Retry lỗi mà không có cảnh báo (Alert) kịp thời, các file WAL/Binlog sẽ tích tụ liên tục. Chỉ trong vài giờ/vài ngày, nó sẽ làm cạn kiệt 100% dung lượng ổ đĩa của Database chính, khiến toàn bộ hệ thống bị crash ngắt đột ngột.

### 3. Phụ thuộc chặt chẽ vào cấu trúc và phiên bản Database

- Tải thêm cho Disk Write (Write Amplification): Để Debezium đọc được đủ chi tiết dữ liệu (nhất là thông tin bản ghi trước và sau khi sửa/xóa), Database phải nâng cấp độ ghi log (ví dụ: wal_level = logical trên Postgres hay binlog_format = ROW, binlog_row_image = FULL trên MySQL). Điều này làm kích thước file Transaction Log phình to hơn nhiều lần, tiêu tốn nhiều Disk I/O hơn.
- Schema Evolution (Thay đổi DDL - Alter Table): Khi bạn đổi tên cột, xóa cột hay thêm cột trong Database:
  - Debezium có thể bị ngắt (break/crash) hoặc đẩy ra các message sai cấu trúc nếu Schema Registry / Connector không được cấu hình tương thích đúng cách.
  - Việc khôi phục (recovery) lại trạng thái snapshot sau sự cố Schema Drift đòi hỏi thao tác rà soát thủ công rất phức tạp.

### 4. Cơ chế delivery "At-Least-Once" bắt buộc xử lý Idempotency

- Nguy cơ Duplicate Event (Bắn trùng lặp tin nhắn): Debezium cam kết gửi dữ liệu theo chuẩn At-Least-Once (Ít nhất một lần). Khi Connector bị sập giữa chừng và khởi động lại, nó có thể đọc trùng lặp một đoạn WAL/Binlog.
- Gánh nặng cho Service tiêu thụ (Consumer): Tất cả các ứng dụng nhận Event từ Debezium bắt buộc 100% phải triển khai Idempotent Consumer (sử dụng Unique Key, Redis Lock, hoặc Deduplication Table). Nếu không, việc trùng lặp event có thể dẫn đến hậu quả nghiêm trọng (trừ tiền 2 lần, cộng kho 2 lần).

### 5. Thách thức trong việc Dọn dẹp Bảng Outbox (Purging Data)

- Khi dùng Debezium kết hợp với Outbox Pattern, dữ liệu trong bảng outbox_messages sẽ phình ra với tốc độ kinh khủng (hàng triệu bản ghi/ngày).
- Rủi ro Xóa nhầm (Data Loss): Nếu cài đặt job xóa ngầm (Cronjob / Partition Drop) thuần túy theo thời gian (ví dụ: Cứ sau 3 ngày thì xóa) mà vô tình Debezium đang bị Lag tới 4 ngày, bạn sẽ xóa mất dữ liệu chưa kịp gửi đi sang Kafka. Script xóa dữ liệu bắt buộc phải query kiểm tra trạng thái Replication Lag trước khi thực thi.

### 6. Khó khăn khi Initial Snapshot (Dữ liệu lịch sử khổng lồ)

- Bài toán: Khi bạn thêm một Debezium Connector mới vào một Database đã có sẵn hàng trăm triệu bản ghi (vài Terabytes dữ liệu).
- Vấn đề: Debezium phải thực hiện giai đoạn Initial Snapshot (đọc toàn bộ DB hiện tại trước khi chuyển sang đọc WAL/Binlog). Quá trình này có thể gây:
  - Lock bảng / Tăng CPU/Memory của Database trong thời gian dài.
  - Tốn rất nhiều thời gian (vài tiếng đến vài ngày) và rất dễ thất bại giữa chừng, bắt buộc phải chạy lại từ đầu nếu cấu hình không tối ưu.

## 7. Tổng kết: Khi nào NÊN và KHÔNG NÊN dùng Debezium?

**KHÔNG NÊN DÙNG KHẢ THI KHI:**

- Hệ thống quy mô vừa & nhỏ, lưu lượng truy cập thấp đến trung bình.
- Đội ngũ kỹ thuật mỏng, chưa có kinh nghiệm vận hành Kafka / CDC / DevOps.
- Giải pháp thay thế: Dùng Outbox Pattern đơn thuần kết hợp với Polling Task (@Cron) bằng SQL nhẹ nhàng hoặc dùng các Message Queue đơn giản như RabbitMQ / Redis Streams.

**BẮT BUỘC / NÊN DÙNG KHI:**

- Hệ thống Enterprise, Ecommerce High-Traffic, Fintech / Core Banking đòi hỏi tính nhất quán dữ liệu tuyệt đối (Zero Data Loss) và độ trễ Real-time (< 10-50ms).
- Cần đồng bộ dữ liệu Real-time từ DB chính sang ElasticSearch, Redis Cache, Data Warehouse mà không muốn ảnh hưởng hiệu năng DB chính.
- Đã có sẵn hạ tầng Kafka và đội ngũ DevOps đủ năng lực kiểm soát monitoring/alerting.

## 8. Cách khắc phục các nhược điểm

Để giải quyết triệt để các nhược điểm và rủi ro vận hành của CDC Debezium mà vẫn giữ nguyên được hiệu năng Real-time vượt trội, bạn cần xây dựng một "Lưới an toàn" (Safety Net) cho hạ tầng của mình.

Dưới đây là Giải pháp chuẩn Kiến trúc Enterprise (Production-Ready Architecture) giúp triệt hạ từng nhược điểm cụ thể:

### 1. Triệt hạ rủi ro "Tràn ổ cứng Database" (WAL/Binlog Bloat)

Đây là nguy cơ nguy hiểm nhất khi Debezium bị ngắt kết nối khiến Database giữ lại file log cho đến khi cạn ổ đĩa.

- Giải pháp 1: Thiết lập Giới hạn Cứng cho Replication Slot (WAL Keeper):
  Trên PostgreSQL 13+, bạn cài đặt tham số max_slot_wal_keep_size trong file postgresql.conf.

```Ini, TOML
# Nếu Debezium bị lag vượt quá 20GB WAL, Postgres sẽ tự động ngắt Slot
# để bảo vệ đĩa cứng không bị tràn (hy sinh CDC để cứu DB chính)
max_slot_wal_keep_size = 20GB
```

- Giải pháp 2: Tự động hóa Script "Safe Purging" kiểm tra Lag trước khi xóa Data:
  Tuyệt đối không xóa/drop partition bảng Outbox theo thời gian cố định. Luôn tạo Stored Procedure kiểm tra chỉ số lag_bytes trước khi thực thi lệnh dọn dẹp:

```SQL
-- Nếu replication lag < 10MB mới cho phép dọn dẹp dữ liệu Outbox
IF (SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)
    FROM pg_replication_slots WHERE slot_name = 'debezium_slot') < 10485760 THEN

    -- Tiến hành Drop Partition hoặc Delete dữ liệu cũ
    DELETE FROM outbox_messages WHERE created_at < NOW() - INTERVAL '3 days';
END IF;
```

### 2. Triệt hạ nhược điểm "Gửi trùng Event" (At-Least-Once Delivery)

Do Debezium đảm bảo dữ liệu không bị mất nên đôi khi sẽ gửi lặp lại Message nếu bị Restart giữa chừng.

- Giải pháp: Chuẩn hóa Idempotent Consumer ở phía ứng dụng nhận (Consumer Service):
  Áp dụng Idempotent Interceptor / Decorator kết hợp với bảng processed_events nằm chung Transaction với logic nghiệp vụ:
  - Kiểm tra nhanh (SELECT 1 FROM processed_events WHERE event_id = ...) trước khi xử lý.
  - Lưu event_id và consumer_group vào DB trong cùng một DB Transaction chứa logic xử lý (ví dụ: trừ kho).
  - Đặt Composite Unique Key (event_id, consumer_group) ở cấp DB để chống Race Condition khi Scale Out nhiều Instance.

### 3. Giải quyết bài toán "Initial Snapshot" gây nặng Database

Khi thêm Connector mới vào Database lớn, Debezium phải scan lại toàn bộ bảng để đồng bộ ban đầu gây Lock/Tải CPU cao.

- Giải pháp 1: Sử dụng Incremental Snapshot (Chỉ có ở Debezium):
  Thay vì quét 1 lần từ đầu tới cuối, Debezium hỗ trợ cơ chế quét theo từng trang (Chunk-based) thông qua Signal Table.
  - Tạo một bảng Signal đơn giản:

  ```SQL
  CREATE TABLE debezium_signal (id VARCHAR(64) PRIMARY KEY, type VARCHAR(32), data VARCHAR(2048));
  ```

  - Gửi Signal yêu cầu Debezium Snapshot theo từng khoảng ID mà không khóa bảng (Lock-free):

  ```SQL
  INSERT INTO debezium_signal VALUES('ad-hoc-1', 'execute-snapshot', '{"data-collections": ["public.outbox_messages"],"type": "incremental"}');
  ```

- Giải pháp 2: Chỉ cho phép Read từ Read-Replica DB:

Do Debezium đảm bảo dữ liệu không bị mất nên đôi khi sẽ gửi lặp lại Message nếu bị Restart giữa chừng.

- Giải pháp: Chuẩn hóa Idempotent Consumer ở phía ứng dụng nhận (Consumer Service):
  Áp dụng Idempotent Interceptor / Decorator kết hợp với bảng processed_events nằm chung Transaction với logic nghiệp vụ:
  - Kiểm tra nhanh (SELECT 1 FROM processed_events WHERE event_id = ...) trước khi xử lý.
  - Lưu event_id và consumer_group vào DB trong cùng một DB Transaction chứa logic xử lý (ví dụ: trừ kho).
  - Đặt Composite Unique Key (event_id, consumer_group) ở cấp DB để chống Race Condition khi Scale Out nhiều Instance.

### 4. Triệt hạ "Độ phức tạp vận hành" (Operational Complexity)

Rào cản lớn nhất của Debezium là cụm hạ tầng cồng kềnh: Kafka + Zookeeper + Kafka Connect.

- Giải pháp 1: Đơn giản hóa Cluster với Kafka KRaft Mode:
  Loại bỏ hoàn toàn Zookeeper. Sử dụng Kafka ở chế độ KRaft (Kafka Raft Metadata) giúp hạ tầng gọn hơn 50%.
- Giải pháp 2: Dùng Debezium Server (Lightweight Standalone Alternative):
  Nếu không muốn dựng cụm Kafka Connect khổng lồ, bạn có thể triển khai Debezium Server (một ứng dụng Java/Quarkus siêu nhẹ).
  - Debezium Server đọc trực tiếp WAL/Binlog từ Database và đẩy thẳng sự kiện sang các Message Broker đơn giản hơn như RabbitMQ, Redis Streams, AWS Kinesis, NATS, GCP PubSub mà không bắt buộc dùng Apache Kafka.

### 5. Xử lý "Schema Drift" (Khi thay đổi cấu trúc Bảng/DDL)

Khi ALTER TABLE đụng đến các cột, Debezium Connector có thể bị crash.

- Giải pháp: Sử dụng Pattern Outbox chuẩn hóa (Schema-less Outbox Payload):
  Thay vì để Debezium bắt sự kiện trực tiếp từ bảng nghiệp vụ (như orders, users), hãy bắt CDC từ duy nhất 1 Bảng Outbox chung.

Cấu trúc Bảng Outbox cố định:

```SQL
CREATE TABLE outbox_messages (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(255) NOT NULL, -- Ví dụ: 'ORDER'
    event_type VARCHAR(255) NOT NULL,     -- Ví dụ: 'ORDER_CREATED'
    payload JSONB NOT NULL,                -- Dữ liệu động dạng JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

- Lợi ích: Cấu trúc bảng Outbox không bao giờ thay đổi (Không bao giờ DDL) dù nghiệp vụ thay đổi ra sao. Tất cả dữ liệu linh hoạt nằm trong cột JSONB payload. CDC Connector chạy năm này qua năm khác mà không lo crash vì Schema Drift.

### 6. Bảng tóm tắt Bộ Giải Pháp (Playbook Vận Hành)

| Nhược điểm Debezium                   | Giải pháp Triệt hạ (Solution)                                                |
| :------------------------------------ | :--------------------------------------------------------------------------- |
| **Tràn đĩa cứng (WAL/Binlog)**        | Cài đặt max_slot_wal_keep_size + Check lag_bytes trước khi dọn Outbox        |
| **Gửi trùng Event (Duplicates)**      | Cài đặt Idempotent Interceptor + Bảng processed_events trong DB Transaction  |
| **Initial Snapshot bị quá tải DB**    | Chạy Incremental Snapshot qua Signal Table hoặc kết nối qua Read-Replica.    |
| **Hạ tầng cồng kềnh (Kafka/Connect)** | Chuyển sang Debezium Server để bắn thẳng Event sang RabbitMQ / Redis Streams |
| **Schema Drift (ALTER TABLE lỗi)**    | Chỉ chạy CDC trên 1 Bảng Outbox cố định có cột JSONB payload                 |

### 7. Cấu hình trong Debezium

Dưới đây là cẩm nang chuyên sâu toàn diện về các nhóm cấu hình cốt lõi của Debezium Connector (đặc biệt cho PostgreSQL). Cẩm nang được phân loại chi tiết theo từng nhóm chức năng, kèm giải thích bản chất hạ tầng (Internal Mechanics) và kinh nghiệm thực chiến dành cho Newbie.

**Nhóm 1: Kết nối & Định danh (Core Connection & Identification)**

```JSON
"connector.class": "io.debezium.connector.postgresql.PostgresConnector",
"tasks.max": "1",
"topic.prefix": "cdc_order",
"plugin.name": "pgoutput",
"slot.name": "debezium_order_slot",
"publication.name": "dbz_publication"
```

- **connector.class**: Chỉ định Class chịu trách nhiệm đọc WAL cho Postgres.
- **tasks.max = "1"**: Với PostgreSQL Logical Replication, bắt buộc luôn luôn là 1. Postgres chỉ cho phép 1 Client duy nhất đọc từ 1 Replication Slot tại một thời điểm để đảm bảo thứ tự dữ liệu (Ordering Guarantee).
- **topic.prefix**: Namespace đại diện cho cụm DB trong hệ sinh thái Kafka. Tất cả internal topic (như schema history, offsets) sẽ dùng prefix này.
- **plugin.name = "pgoutput"**: Logical Decoding Plugin mặc định của PostgreSQL (từ v10+).
  - Vì sao nên dùng: Không cần cài thêm extension C/C++ ngoài (như wal2json hay decoderbufs), giúp tránh rủi ro gây panic/crash cho Database Engine.
- **slot.name**: Tên của Logical Replication Slot được tạo trên Postgres
  - Kinh nghiệm: Nên đặt tên cố định (ví dụ: debezium_order_slot) để dễ theo dõi trong bảng pg_replication_slots của Postgres.
- **publication.name**: Tên của Postgres Publication được Debezium tự tạo hoặc chỉ định sẵn (CREATE PUBLICATION).

**Nhóm 2: Lọc dữ liệu (Data Filtering)**

```JSON
"table.include.list": "public.outbox_messages",
"column.include.list": "public.outbox_messages.(id|aggregatetype|aggregateid|payload)",
"tombstones.on.delete": "false"
```

- **table.include.list**: Danh sách các bảng cho phép Debezium đọc.
  - Tác dụng: Giúp Debezium chỉ tập trung lắng nghe bảng outbox_messages. Tránh việc Debezium đọc toàn bộ WAL của các bảng khác (orders, users...), gây lãng phí CPU, RAM và I/O.
- **column.include.list**: Bảng lọc cấp cột (Column-level Whitelist). Nếu bảng outbox có những cột rác/cột tạm, bạn dùng config này để chỉ gửi các cột cần thiết về Kafka.
- **tombstones.on.delete = "false"**:
  - Mặc định khi một dòng bị DELETE, Debezium sẽ gửi 2 message: một message chứa dữ liệu trước khi xóa, và một message null (Tombstone record) để dọn Kafka Compaction.
  - Nếu ứng dụng của bạn không dùng Kafka Log Compaction, hãy đặt là false để tránh bắn ra các null message vô nghĩa làm crash Consumer.

**Nhóm 3: Định tuyến & Chuyển đổi dữ liệu (Outbox EventRouter SMT)**

Single Message Transform (SMT) giúp biến các CDC Event cồng kềnh (chứa metadata before, after, source...) thành các Domain Event gọn nhẹ.

```JSON
"transforms": "outbox",
"transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
"transforms.outbox.route.topic.replacement": "events.${routedByValue}",
"transforms.outbox.table.fields.additional.placement": "type:header:eventType",
"transforms.outbox.id.column": "id",
"transforms.outbox.aggregate.type.column": "aggregatetype",
"transforms.outbox.aggregate.id.column": "aggregateid",
"transforms.outbox.payload.attribute.column": "payload"
```

- **transforms & transforms.outbox.type**: Kích hoạt và khai báo class Plugin EventRouter.
- **transforms.outbox.route.topic.replacement**: Định tuyến Topic động dựa trên giá trị của thuộc tính ${routedByValue}.
- **transforms.outbox.aggregate.type.column**: Chỉ định cột trong DB làm nguồn lấy giá trị gán cho ${routedByValue}.
  - Ví dụ: Cột aggregatetype có giá trị là "Order" $\rightarrow$ Message sẽ bắn vào Topic events.Order.
- **transforms.outbox.table.fields.additional.placement**:
  - Cú pháp: <tên*cột_in_db>:<vị_trí*đặt>:<tên_key>
  - type:header:eventType: Đẩy dữ liệu cột type trong DB thành một Kafka Header mang tên eventType. Consumer có thể đọc Header này để routing hàm xử lý mà không cần parse JSON body.
- **transforms.outbox.id.column / aggregate.id.column / payload.attribute.column**: Ghi đè (Override) tên cột trong Database tương ứng với thuộc tính chuẩn của Debezium Outbox.
  - Vì sao Newbie thường dính lỗi ở đây: Các ORM như TypeORM tự động hạ tên cột thành dạng chữ thường (lowercase) aggregatetype thay vì aggregateType. Khai báo chính xác các thuộc tính này giúp tránh lỗi IllegalArgumentException: Could not find column....

**Nhóm 4: Quản lý Snapshots (Snapshot Engine Configs)**

Chế độ quét dữ liệu có sẵn khi vừa bật Debezium Connector.

```JSON
"snapshot.mode": "initial",
"snapshot.locking.mode": "none"
```

- **snapshot.mode:**
  - **initial (Mặc định)**: Khi khởi chạy lần đầu, Debezium quét sạch các bản ghi đang có trong bảng rồi mới chuyển sang đọc log WAL.
  - **never**: Bỏ qua dữ liệu quá khứ, chỉ đọc những biến động phát sinh từ thời điểm bắt đầu bật Connector.
  - **custom**: Cho phép tùy chỉnh logic quét nâng cao.
- **snapshot.locking.mode = "none"**: Không thực hiện lock bảng trong quá trình chụp Snapshot ban đầu, tránh gây ngưng trệ các API INSERT/UPDATE của hệ thống chính.

**Nhóm 5: Đảm bảo An toàn & Hiệu năng (Performance & Error Handling)**

Những cấu hình này ít khi thấy trong ví dụ Demo nhưng bắt buộc phải biết khi làm hệ thống Production.

```JSON
"max.batch.size": "2048",
"max.queue.size": "8192",
"poll.interval.ms": "500",
"errors.tolerance": "all",
"errors.deadletterqueue.topic.name": "dlq_debezium_errors"
```

- **max.batch.size**: Số lượng bản ghi tối đa Debezium gom lại để xử lý và đẩy sang Kafka trong 1 đợt (Batch Processing). Tăng con số này giúp tăng throughput khi hệ thống có traffic cao.
- **max.queue.size**: Dung lượng hàng đợi trên RAM của Debezium để chứa các event vừa đọc từ WAL trước khi ghi sang Kafka.
- **poll.interval.ms**: Khoảng thời gian chờ (trước khi đọc tiếp log WAL) nếu chưa có dữ liệu mới.
- **errors.tolerance = "all"**:
  - **none (Mặc định)**: Nếu gặp 1 record lỗi (ví dụ JSON hỏng), Debezium Connector sẽ sập (CRASH) lập tức để bảo đảm an toàn.
  - **all**: Bỏ qua record lỗi và tiếp tục chạy (cần đi kèm với Dead Letter Queue bên dưới).
- **errors.deadletterqueue.topic.name**: Đẩy các record bị biến đổi lỗi hoặc không tương thích cấu hình vào một Topic riêng (DLQ) để developer kiểm tra sau, tránh làm tắc nghẽn luồng CDC chính.
