-- ===========================================================================
--  实时竞拍大师 —— 数据库结构 (MySQL 8 / utf8mb4)
--  金额统一以「分」为单位的 BIGINT 存储，避免浮点误差。
-- ===========================================================================
SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- 用户：商家(主播) / 买家
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  nickname      VARCHAR(64) NOT NULL,
  avatar        VARCHAR(512) NULL,
  role          ENUM('MERCHANT','BUYER') NOT NULL DEFAULT 'BUYER',
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 商品
CREATE TABLE IF NOT EXISTS products (
  id           BIGINT      NOT NULL AUTO_INCREMENT,
  merchant_id  BIGINT      NOT NULL,
  title        VARCHAR(128) NOT NULL,
  image        VARCHAR(512) NULL,
  description  TEXT        NOT NULL,
  category     VARCHAR(32) NOT NULL DEFAULT '其他',
  created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_merchant (merchant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 竞拍场次（核心表，含状态机 + 规则 + 乐观锁版本号）
CREATE TABLE IF NOT EXISTS auctions (
  id                  BIGINT  NOT NULL AUTO_INCREMENT,
  product_id          BIGINT  NOT NULL,
  merchant_id         BIGINT  NOT NULL,
  status              ENUM('PENDING','LIVE','ENDED','CANCELED') NOT NULL DEFAULT 'PENDING',
  result              ENUM('SOLD','UNSOLD','CANCELED') NULL,
  settle_reason       ENUM('TIME_UP','CAP_REACHED','MANUAL') NULL,

  -- 规则
  start_price         BIGINT  NOT NULL DEFAULT 0,
  bid_increment       BIGINT  NOT NULL,
  cap_price           BIGINT  NULL,
  duration_sec        INT     NOT NULL,
  anti_snipe_window_sec INT   NOT NULL DEFAULT 10,
  delay_sec           INT     NOT NULL DEFAULT 15,
  max_delay_times     INT     NOT NULL DEFAULT 10,

  -- 实时状态
  current_price       BIGINT  NOT NULL DEFAULT 0,
  leader_id           BIGINT  NULL,
  leader_nickname     VARCHAR(64) NULL,
  bid_count           INT     NOT NULL DEFAULT 0,
  participant_count   INT     NOT NULL DEFAULT 0,
  delay_count         INT     NOT NULL DEFAULT 0,
  version             INT     NOT NULL DEFAULT 0,   -- 乐观锁

  -- 时间
  start_at            DATETIME NOT NULL,
  end_at              DATETIME NOT NULL,
  ended_at            DATETIME NULL,

  -- 结果
  winner_id           BIGINT  NULL,
  winner_nickname     VARCHAR(64) NULL,
  final_price         BIGINT  NULL,

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status (status),
  KEY idx_merchant (merchant_id),
  KEY idx_end_at (end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 出价流水（不可变，append-only）
CREATE TABLE IF NOT EXISTS bids (
  id          BIGINT      NOT NULL AUTO_INCREMENT,
  auction_id  BIGINT      NOT NULL,
  user_id     BIGINT      NOT NULL,
  nickname    VARCHAR(64) NOT NULL,
  amount      BIGINT      NOT NULL,
  request_id  VARCHAR(64) NOT NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- 数据库层幂等兜底：同一场次同一 requestId 只允许一条
  UNIQUE KEY uk_auction_request (auction_id, request_id),
  KEY idx_auction_amount (auction_id, amount DESC),
  KEY idx_auction_user (auction_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单（成交后生成，一场竞拍至多一单）
CREATE TABLE IF NOT EXISTS orders (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  order_no        VARCHAR(32) NOT NULL,
  auction_id      BIGINT      NOT NULL,
  product_id      BIGINT      NOT NULL,
  product_title   VARCHAR(128) NOT NULL,
  product_image   VARCHAR(512) NULL,
  buyer_id        BIGINT      NOT NULL,
  buyer_nickname  VARCHAR(64) NOT NULL,
  merchant_id     BIGINT      NOT NULL,
  amount          BIGINT      NOT NULL,
  status          ENUM('PENDING_PAYMENT','PAID','CANCELED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at         DATETIME    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  UNIQUE KEY uk_auction (auction_id),
  KEY idx_buyer (buyer_id),
  KEY idx_merchant (merchant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
