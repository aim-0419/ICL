import mysql from "mysql2/promise";
import { env } from "../../config/env.js";

const DEFAULT_PRODUCTS = [
  {
    id: "starter",
    name: "Starter Guide Pack",
    price: 129000,
    description: "기초 해부학, 자세 분석, 수업 도입 스크립트를 담은 입문 패키지",
    period: "90일",
  },
  {
    id: "cueing",
    name: "Cueing & Sequencing Master",
    price: 219000,
    description: "회원 반응을 끌어내는 큐잉 언어와 시퀀스 설계 노하우 집중 과정",
    period: "180일",
  },
  {
    id: "premium",
    name: "Premium Academy Bundle",
    price: 349000,
    description: "강사 교육, 회원 상담, 스튜디오 운영 가이드를 한 번에 묶은 통합 번들",
    period: "365일",
  },
];

const ACADEMY_VIDEO_PRODUCTS = [
  {
    id: "video-1",
    name: "코어 정렬과 호흡 패턴 입문",
    price: 129000,
    description: "코어 정렬, 호흡 패턴, 기초 수업 루틴 구성 입문 과정",
    period: "90일",
  },
  {
    id: "video-2",
    name: "기구 필라테스 큐잉 언어 마스터",
    price: 159000,
    description: "실전 큐잉 언어와 시퀀싱을 배우는 초급 집중 과정",
    period: "180일",
  },
  {
    id: "video-3",
    name: "초급 회원 체형 분석 실전 워크숍",
    price: 69300,
    description: "회원별 체형 분석과 동작 교정 포인트 실습 과정",
    period: "90일",
  },
  {
    id: "video-4",
    name: "소그룹 수업 운영 시나리오 설계",
    price: 89000,
    description: "소그룹 클래스 운영 흐름과 상담 전환 구조 설계",
    period: "180일",
  },
  {
    id: "video-5",
    name: "누구나 빠르게 시작하는 레슨 가이드",
    price: 9900,
    description: "처음 수업을 시작하는 강사를 위한 레슨 진행 가이드",
    period: "90일",
  },
  {
    id: "video-6",
    name: "리포머 자동 교정 큐 실습",
    price: 5500,
    description: "리포머 동작의 교정 큐를 빠르게 적용하는 실습 과정",
    period: "180일",
  },
  {
    id: "video-7",
    name: "코칭 대본으로 완성하는 바이브 코딩",
    price: 38500,
    description: "상담/수업 코칭 대본으로 운영 퍼포먼스를 높이는 과정",
    period: "180일",
  },
  {
    id: "video-8",
    name: "매출로 연결되는 상담 스크립트",
    price: 77000,
    description: "상담부터 결제 전환까지 이어지는 실전 스크립트",
    period: "365일",
  },
  {
    id: "video-9",
    name: "필라테스 스튜디오 운영툴 기초",
    price: 8250,
    description: "스튜디오 운영 자동화를 위한 기초 관리 툴 정리",
    period: "180일",
  },
  {
    id: "video-10",
    name: "썸네일/홍보 디자인으로 매출 높이기",
    price: 4400,
    description: "온라인 홍보 소재 제작과 운영 실전 가이드",
    period: "365일",
  },
];

const DEFAULT_REVIEW_POSTS = [
  { id: "review-101", title: "체형 분석 이후 수업 몰입도가 확실히 달라졌어요", author: "김OO", date: "2026-04-05", views: 128 },
  { id: "review-100", title: "초급 가이드 영상으로 수업 준비 시간이 줄었습니다", author: "박OO", date: "2026-04-03", views: 94 },
  { id: "review-099", title: "강사 코칭 피드백이 상세해서 재등록 결정했어요", author: "이OO", date: "2026-04-01", views: 156 },
  { id: "review-098", title: "리포머 수업 동작 설명이 이해하기 쉬웠습니다", author: "정OO", date: "2026-03-29", views: 77 },
  { id: "review-097", title: "중급 프로그램 루틴이 체계적이라 만족합니다", author: "최OO", date: "2026-03-27", views: 83 },
  { id: "review-096", title: "수업 후 루틴 가이드 덕분에 집에서도 꾸준히 했어요", author: "유OO", date: "2026-03-25", views: 102 },
  { id: "review-095", title: "상담부터 수업까지 흐름이 자연스러워서 좋았습니다", author: "한OO", date: "2026-03-23", views: 69 },
  { id: "review-094", title: "교육 영상 구매 후 실제 수업 적용에 도움이 됐어요", author: "임OO", date: "2026-03-20", views: 117 },
  { id: "review-093", title: "장비 설명이 자세해서 처음인데도 불안하지 않았습니다", author: "송OO", date: "2026-03-18", views: 58 },
  { id: "review-092", title: "클래스 분위기가 차분해서 집중하기 좋았어요", author: "오OO", date: "2026-03-15", views: 141 },
  { id: "review-091", title: "고급 과정에서 큐잉 포인트를 많이 배웠습니다", author: "서OO", date: "2026-03-12", views: 88 },
];

const DEFAULT_EVENTS = [
  {
    id: "event-1",
    title: "신규 회원 웰컴 패키지 증정 이벤트",
    status: "진행중",
    startDate: "2026-04-05",
    endDate: "2026-04-30",
    likes: 48,
    image: "https://images.unsplash.com/photo-1554244933-d876deb6b2ff?auto=format&fit=crop&w=1200&q=80",
    summary:
      "첫 등록 회원에게 체형 분석 1회 + 개인 루틴 카드 + 필라테스 밴드를 함께 제공하는 봄 시즌 한정 프로모션입니다.",
  },
  {
    id: "event-2",
    title: "강사용 큐잉 가이드 봄 시즌 할인",
    status: "진행중",
    startDate: "2026-03-28",
    endDate: "2026-04-18",
    likes: 31,
    image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
    summary:
      "큐잉 실전 가이드 영상 패키지를 기간 한정가로 제공하며, 구매자 대상 라이브 Q&A 세션 참여 혜택이 포함됩니다.",
  },
  {
    id: "event-3",
    title: "리뉴얼 오픈 기념 상담 혜택",
    status: "종료",
    startDate: "2026-03-01",
    endDate: "2026-03-15",
    likes: 64,
    image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80",
    summary: "리뉴얼 기간 동안 진행된 상담 이벤트로, 신규 상담 고객에게 수업 체험권과 등록 할인 혜택을 제공했습니다.",
  },
  {
    id: "event-4",
    title: "회원 추천 리워드 프로그램",
    status: "진행중",
    startDate: "2026-04-01",
    endDate: "2026-05-01",
    likes: 19,
    image: "https://images.unsplash.com/photo-1495555961986-6d4c1ecb7be3?auto=format&fit=crop&w=1200&q=80",
    summary: "기존 회원이 친구를 추천하면 추천인/피추천인 모두에게 수강 할인 쿠폰과 굿즈 포인트를 지급하는 이벤트입니다.",
  },
  {
    id: "event-5",
    title: "주말 집중 리포머 클래스 특가",
    status: "종료",
    startDate: "2026-02-10",
    endDate: "2026-02-28",
    likes: 27,
    image: "https://images.unsplash.com/photo-1549576490-b0b4831ef60a?auto=format&fit=crop&w=1200&q=80",
    summary: "주말 시간대 집중 프로그램을 한정 오픈했던 이벤트로, 단기 집중 수업을 원하는 회원 중심으로 운영되었습니다.",
  },
  {
    id: "event-6",
    title: "강사 역량 업 세미나 모집 이벤트",
    status: "종료",
    startDate: "2026-01-20",
    endDate: "2026-02-05",
    likes: 15,
    image: "https://images.unsplash.com/photo-1524863479829-916d8e77f114?auto=format&fit=crop&w=1200&q=80",
    summary: "강사 대상 시퀀스 설계 세미나 참가자 모집 이벤트로, 우수 후기 작성자에게 추가 교육 콘텐츠를 제공했습니다.",
  },
];

const DEFAULT_INQUIRIES = [
  {
    id: "inquiry-301",
    title: "강사 교육 영상 단체 구매 문의드립니다",
    content:
      "안녕하세요.\n지점 강사 4명이 함께 수강할 예정인데 단체 결제 가능한지 문의드립니다.\n결제 방식과 할인 조건이 있다면 안내 부탁드립니다.",
    author: "김OO",
    authorId: "seed-user-1",
    date: "2026-04-07",
    views: 41,
    isSecret: false,
  },
  {
    id: "inquiry-300",
    title: "수강권 결제 오류 관련 문의",
    content:
      "결제 승인 이후 페이지가 멈춰서 수강권 등록 여부를 확인하고 싶습니다.\n주문번호는 PILATES-20260406-112 입니다.\n확인 후 답변 부탁드립니다.",
    author: "박OO",
    authorId: "seed-user-2",
    date: "2026-04-06",
    views: 26,
    isSecret: true,
  },
  {
    id: "inquiry-299",
    title: "사업자용 영수증 발행 가능 여부",
    content:
      "교육영상 결제 건에 대해 사업자등록번호로 영수증 발행 가능한지 궁금합니다.\n가능하다면 발행 절차도 함께 안내 부탁드립니다.",
    author: "이OO",
    authorId: "seed-user-3",
    date: "2026-04-04",
    views: 33,
    isSecret: false,
  },
];

const pool = mysql.createPool({
  host: env.dbHost,
  port: env.dbPort,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  connectionLimit: 10,
  waitForConnections: true,
  namedPlaceholders: true,
  timezone: "Z",
});

let initPromise = null;

async function seedProductsIfEmpty() {
  const products = [...DEFAULT_PRODUCTS, ...ACADEMY_VIDEO_PRODUCTS];
  for (const product of products) {
    await pool.execute(
      `INSERT INTO products (id, name, price, description, period)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         price = VALUES(price),
         description = VALUES(description),
         period = VALUES(period)`,
      [product.id, product.name, product.price, product.description, product.period]
    );
  }
}

async function seedCommunityIfEmpty() {
  const [reviewCountRows] = await pool.query("SELECT COUNT(*) AS count FROM review_posts");
  const reviewCount = Number(reviewCountRows?.[0]?.count ?? 0);
  if (reviewCount === 0) {
    for (const post of DEFAULT_REVIEW_POSTS) {
      await pool.execute(
        `INSERT INTO review_posts (id, title, content, author, date, views, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          post.id,
          post.title,
          post.content || `${post.title}\n후기 게시판 기본 데이터입니다.`,
          post.author,
          post.date,
          post.views,
        ]
      );
    }
  }

  const [eventCountRows] = await pool.query("SELECT COUNT(*) AS count FROM events");
  const eventCount = Number(eventCountRows?.[0]?.count ?? 0);
  if (eventCount === 0) {
    for (const event of DEFAULT_EVENTS) {
      await pool.execute(
        `INSERT INTO events (id, title, status, start_date, end_date, likes, image, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.id, event.title, event.status, event.startDate, event.endDate, event.likes, event.image, event.summary]
      );
    }
  }

  const [inquiryCountRows] = await pool.query("SELECT COUNT(*) AS count FROM inquiry_posts");
  const inquiryCount = Number(inquiryCountRows?.[0]?.count ?? 0);
  if (inquiryCount === 0) {
    for (const inquiry of DEFAULT_INQUIRIES) {
      await pool.execute(
        `INSERT INTO inquiry_posts (id, title, content, author, author_id, date, views, is_secret, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          inquiry.id,
          inquiry.title,
          inquiry.content,
          inquiry.author,
          inquiry.authorId,
          inquiry.date,
          inquiry.views,
          inquiry.isSecret ? 1 : 0,
        ]
      );
    }
  }
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      login_id VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(40) NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'user',
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL
    )
  `);

  const [loginIdColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'login_id'`
  );
  const hasLoginIdColumn = Number(loginIdColumnRows?.[0]?.count ?? 0) > 0;

  if (!hasLoginIdColumn) {
    await pool.query(`ALTER TABLE users ADD COLUMN login_id VARCHAR(80) NULL AFTER id`);
  }

  await pool.query(
    `UPDATE users
     SET login_id = CONCAT('user_', LEFT(REPLACE(id, 'user-', ''), 12))
     WHERE login_id IS NULL OR login_id = ''`
  );

  const [loginIdIndexRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'login_id'
       AND NON_UNIQUE = 0`
  );
  const hasLoginIdIndex = Number(loginIdIndexRows?.[0]?.count ?? 0) > 0;

  if (!hasLoginIdIndex) {
    await pool.query(`ALTER TABLE users ADD UNIQUE INDEX ux_users_login_id (login_id)`);
  }

  await pool.query(`ALTER TABLE users MODIFY login_id VARCHAR(80) NOT NULL`);

  const [roleColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'role'`
  );
  const hasRoleColumn = Number(roleColumnRows?.[0]?.count ?? 0) > 0;

  if (!hasRoleColumn) {
    await pool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(40) NULL AFTER phone`);
  }

  await pool.query(
    `UPDATE users
     SET role = 'user'
     WHERE role IS NULL OR role = ''`
  );

  await pool.query(`ALTER TABLE users MODIFY role VARCHAR(40) NOT NULL DEFAULT 'user'`);

  const [isAdminColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'is_admin'`
  );
  const hasIsAdminColumn = Number(isAdminColumnRows?.[0]?.count ?? 0) > 0;

  if (!hasIsAdminColumn) {
    await pool.query(`ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NULL DEFAULT 0 AFTER role`);
  }

  await pool.query(
    `UPDATE users
     SET is_admin = 0
     WHERE is_admin IS NULL`
  );

  await pool.query(`ALTER TABLE users MODIFY is_admin TINYINT(1) NOT NULL DEFAULT 0`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_sessions_user_id (user_id),
      CONSTRAINT fk_sessions_users
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(190) NOT NULL,
      price INT NOT NULL,
      description TEXT NULL,
      period VARCHAR(50) NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      user_id VARCHAR(64) NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (user_id, product_id),
      INDEX idx_cart_items_user (user_id),
      CONSTRAINT fk_cart_items_products
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(80) PRIMARY KEY,
      order_name VARCHAR(255) NULL,
      amount INT NULL,
      customer_email VARCHAR(190) NULL,
      payload JSON NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_orders_created_at (created_at),
      INDEX idx_orders_customer_email (customer_email)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_posts (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NULL,
      author VARCHAR(120) NOT NULL,
      date VARCHAR(20) NOT NULL,
      views INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL
    )
  `);

  const [reviewContentColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'review_posts'
       AND COLUMN_NAME = 'content'`
  );
  const hasReviewContentColumn = Number(reviewContentColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasReviewContentColumn) {
    await pool.query(`ALTER TABLE review_posts ADD COLUMN content TEXT NULL AFTER title`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_comments (
      id VARCHAR(80) PRIMARY KEY,
      review_id VARCHAR(80) NOT NULL,
      author VARCHAR(120) NOT NULL,
      content TEXT NOT NULL,
      created_at VARCHAR(20) NOT NULL,
      INDEX idx_review_comments_review_id (review_id),
      CONSTRAINT fk_review_comments_posts
        FOREIGN KEY (review_id) REFERENCES review_posts(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(30) NOT NULL,
      start_date VARCHAR(20) NOT NULL,
      end_date VARCHAR(20) NOT NULL,
      likes INT NOT NULL DEFAULT 0,
      image TEXT NOT NULL,
      summary TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiry_posts (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      author VARCHAR(120) NOT NULL,
      author_id VARCHAR(80) NULL,
      date VARCHAR(20) NOT NULL,
      views INT NOT NULL DEFAULT 0,
      is_secret TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL
    )
  `);

  await seedProductsIfEmpty();
  await seedCommunityIfEmpty();
}

async function ensureInitialized() {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  await initPromise;
}

export async function query(sql, params = []) {
  await ensureInitialized();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function pingDatabase() {
  await ensureInitialized();
  await pool.query("SELECT 1");
}
