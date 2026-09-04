-- ==========================================
-- 1. CẤU HÌNH BIẾN SEED DỮ LIỆU
-- ==========================================
SET @restaurant_id = 1;
SET @inventory_item_id = 500;
SET @inventory_group_id = 1;

-- Cấu hình quy mô hệ thống
SET @total_shards = 3;                       -- Tổng số Shard trong cluster
SET @total_tables_per_restaurant = 10;     -- Tổng số bàn của nhà hàng (chia đều cho các Shard)

-- Tự động trích xuất ID Shard hiện tại từ tên Database (VD: db_shard_0 -> lấy ra 0)
SET @current_shard_id = IFNULL(CAST(RIGHT(DATABASE(), 1) AS UNSIGNED), 0);

-- Số lượng Bounded Pool kho theo Shard
SET @initial_quantity = CASE @current_shard_id
    WHEN 0 THEN 1000
    WHEN 1 THEN 5000
    WHEN 2 THEN 10000
    ELSE 1000
END;

-- Clean dữ liệu cũ để tránh lỗi Duplicate Key khi re-seed
TRUNCATE TABLE available_units_shard;
TRUNCATE TABLE restaurant_table;

-- Nạp tổng tồn kho vào Sổ chính (Ledger)
INSERT INTO inventory_ledger_shard (
    restaurant_id,
    inventory_item_id,
    shard_id,
    quantity
) VALUES (
    @restaurant_id,
    @inventory_item_id,
    @current_shard_id,
    @initial_quantity
)
ON DUPLICATE KEY UPDATE quantity = @initial_quantity;

-- ==========================================
-- 2. STORED PROCEDURE SEEDING BÀN & INVENTORY
-- ==========================================

DELIMITER $$

-- Xóa Procedure cũ (dùng đúng delimiter $$)
DROP PROCEDURE IF EXISTS seed_distributed_shard_data$$

CREATE PROCEDURE seed_distributed_shard_data()
BEGIN
    DECLARE i INT DEFAULT 1;
    DECLARE table_idx INT DEFAULT 1;
    DECLARE capacity_val INT;

    -- -------------------------------------------------------------
    -- A. Seed Bounded Pool Units cho Inventory
    -- -------------------------------------------------------------
    WHILE i <= @initial_quantity DO
        INSERT INTO available_units_shard (
            restaurant_id,
            inventory_item_id,
            inventory_group_id,
            shard_id
        ) VALUES (
            @restaurant_id,
            @inventory_item_id,
            @inventory_group_id,
            @current_shard_id
        );
        SET i = i + 1;
    END WHILE;

    IF @current_shard_id = 0 THEN
        WHILE table_idx <= @total_tables_per_restaurant DO

            SET capacity_val = CASE 
                WHEN table_idx % 5 = 1 THEN 2
                WHEN table_idx % 5 = 2 THEN 4
                WHEN table_idx % 5 = 3 THEN 6
                WHEN table_idx % 5 = 4 THEN 8
                ELSE 10
            END;

            INSERT INTO restaurant_table (
                restaurant_id,
                code,
                capacity,
                status,
                shard_id
            ) VALUES (
                @restaurant_id,
                CONCAT('T_', LPAD(table_idx, 4, '0')),
                capacity_val,
                'AVAILABLE',
                @current_shard_id
            );
            
            SET table_idx = table_idx + 1;

        END WHILE;
    END IF;

END$$

-- Trả Delimiter về lại mặc định (dấu chấm phẩy)
DELIMITER ;

-- Chạy Procedure nạp dữ liệu
CALL seed_distributed_shard_data();

-- Dọn dẹp Procedure sau khi nạp xong
DROP PROCEDURE IF EXISTS seed_distributed_shard_data;