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
