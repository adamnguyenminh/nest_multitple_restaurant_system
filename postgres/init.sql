ALTER USER postgres WITH SUPERUSER CREATEDB;

-- Tạo Enum type cho Status
CREATE TYPE "table_status_enum" AS ENUM ('AVAILABLE', 'RESERVED', 'SEATED', 'CLEANING');

-- Tạo Bảng restaurant_tables
CREATE TABLE IF NOT EXISTS "restaurant_tables" (
    "entity_id" SERIAL PRIMARY KEY,
    "code" VARCHAR NOT NULL UNIQUE,
    "restaurant_id" INT NOT NULL,
    "capacity" INT NOT NULL,
    "status" "table_status_enum" NOT NULL DEFAULT 'AVAILABLE',
    "shard_id" INT NOT NULL DEFAULT 0,
    "version" INT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tạo Index
CREATE INDEX IF NOT EXISTS "idx_restaurant_table" 
ON "restaurant_tables" ("restaurant_id", "capacity", "status", "shard_id");

-- Seed Data mẫu
INSERT INTO "restaurant_tables" ("code", "restaurant_id", "capacity", "status", "shard_id", "version")
VALUES 
    ('TBL-101', 1, 4, 'AVAILABLE', 0, 1),
    ('TBL-102', 1, 2, 'AVAILABLE', 0, 1),
    ('TBL-103', 1, 6, 'AVAILABLE', 0, 1),
    ('TBL-201', 2, 4, 'AVAILABLE', 0, 1)
ON CONFLICT ("code") DO NOTHING;