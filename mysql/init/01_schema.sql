-- 1. Sổ chính quản lý tổng tồn kho phân bổ cho Shard này
CREATE TABLE IF NOT EXISTS inventory_ledger_shard (
    entity_id BIGINT NOT NULL AUTO_INCREMENT,

    restaurant_id INT NOT NULL,
    inventory_item_id INT NOT NULL,
    shard_id INT NOT NULL,
    quantity INT NOT NULL,

    PRIMARY KEY (entity_id),

    UNIQUE KEY uk_inventory_ledger_shard (
        restaurant_id,
        inventory_item_id,
        shard_id
    )
) ENGINE=InnoDB;

-- 2. Kệ hàng Bounded Pool dùng cho SELECT FOR UPDATE SKIP LOCKED trên Shard này
CREATE TABLE IF NOT EXISTS available_units_shard (
    entity_id BIGINT NOT NULL AUTO_INCREMENT,

    restaurant_id INT NOT NULL,
    inventory_item_id INT NOT NULL,
    inventory_group_id INT NOT NULL,
    shard_id INT NOT NULL,

    PRIMARY KEY (entity_id),

    -- Không cần ghi entity_id ở cuối, InnoDB tự đính kèm vào để làm Covering Index
    INDEX idx_available_units_shard_lookup (
        restaurant_id,
        inventory_item_id,
        inventory_group_id,
        shard_id
    )
) ENGINE=InnoDB;

-- 3. Bảng này sẽ nằm trên từng MySQL Shard (cùng database với available_units_shard) để đảm bảo ghi log trong cùng 1 SQL Transaction
CREATE TABLE IF NOT EXISTS reserve_items_shard (
    reservation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    restaurant_id INT NOT NULL,
    inventory_item_id BIGINT NOT NULL,
    inventory_group_id INT NOT NULL,
    shard_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    status ENUM('RESERVED', 'CONFIRMED', 'CANCELLED', 'EXPIRED') DEFAULT 'RESERVED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_user_item (user_id, inventory_item_id),
    INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Bảng quản lý Bàn (restaurant_table)
CREATE TABLE IF NOT EXISTS `restaurant_table` (
    `entity_id` INT AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(20) NOT NULL UNIQUE,
    `restaurant_id` INT NOT NULL,
    `capacity` INT NOT NULL,
    `status` ENUM('AVAILABLE', 'RESERVED', 'SEATED', 'CLEANING') NOT NULL DEFAULT 'AVAILABLE',
    `version` INT NOT NULL DEFAULT 1,
    `shard_id` INT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, -- Thêm dấu phẩy ở đây
    
    INDEX `idx_restaurant_table` (`restaurant_id`, `capacity`, `status`, `shard_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;