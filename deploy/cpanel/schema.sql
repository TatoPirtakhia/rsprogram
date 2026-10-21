-- Select your database in phpMyAdmin, then Import this file.
-- These tables are also created automatically on first startup.
CREATE TABLE IF NOT EXISTS rs_profiles (
  uid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  username VARCHAR(254) COLLATE utf8mb4_bin NOT NULL UNIQUE,
  payload LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS rs_push_tokens (
  token VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB;
