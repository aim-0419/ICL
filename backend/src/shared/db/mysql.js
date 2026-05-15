/**
 * 데이터베이스(MySQL) 설정 및 스키마 관리
 * - mysql2/promise 기반 커넥션 풀 생성 및 공통 query/queryOne 헬퍼 제공
 * - 서버 기동 시 initializeDatabase()를 호출해 스키마 자동 초기화 (마이그레이션 도구 불필요)
 *
 * 스키마 관리 방식:
 * - CREATE TABLE IF NOT EXISTS로 테이블을 생성
 * - 이후 ALTER TABLE로 누락 컬럼을 개별 추가 (기존 테이블 보호)
 * - ensureUtf8mb4TableCollation(): 모든 테이블의 문자셋을 utf8mb4로 통일
 * - repairLegacyMojibakeData(): 과거 latin1 인코딩으로 저장된 한글 깨짐 데이터 복구
 * - purgeWithdrawnUsers(): 탈퇴 후 파기 기한이 지난 회원 데이터 자동 삭제
 *
 * 테이블 목록 (30개):
 * users, sessions, email_verifications              → 인증·회원
 * products                                          → 상품
 * academy_videos, academy_video_chapters            → 강의·차시
 * academy_progress, academy_chapter_progress        → 학습 진도
 * academy_playback_sessions                         → 보안 재생 세션
 * academy_reviews, academy_qna_posts, academy_qna_replies → 수강평·Q&A
 * cart_items, orders, point_history                 → 장바구니·주문·포인트
 * payment_confirmations, payment_webhook_events     → 결제 검증·웹훅
 * refund_requests                                   → 환불
 * video_grants                                      → 강의 선물 권한
 * social_feed_cache                                 → 소셜 피드 캐시
 * review_posts, review_comments                     → 커뮤니티 후기
 * events                                            → 커뮤니티 이벤트
 * inquiry_posts, inquiry_replies                    → 커뮤니티 문의
 * admin_page_overrides                              → 관리자 페이지 오버라이드
 * login_rate_limits, signup_rate_limits             → 로그인·회원가입 요청 제한
 * instructors, branches                             → 강사·지점 정보
 *
 * 시드 데이터: 없음 (모든 데이터는 관리자 패널로 직접 등록)
 */
// 파일 역할: MySQL 연결 풀, 스키마 자동 보정, 기본 데이터 시드, 공통 query 헬퍼를 담당합니다.
import mysql from "mysql2/promise";
import { env } from "../../config/env.js";
import { hashPassword } from "../security/password.js";
import {
  decryptPii,
  emailHash,
  encryptPii,
  encryptedUserValues,
  isEncryptedPii,
  nameHash,
  normalizeBirthYear,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  phoneHash,
  shouldReencryptPii,
} from "../security/pii.js";

// 이 파일은 MySQL 연결, 테이블 보정, 기본 시드 데이터 주입까지 함께 담당한다.
// 별도 마이그레이션 도구 없이 앱 시작 시 필요한 스키마를 맞추는 구조다.

const pool = mysql.createPool({
  host: env.dbHost,
  port: env.dbPort,
  user: env.dbUser,
  password: env.dbPassword,
  database: env.dbName,
  charset: "utf8mb4",
  connectionLimit: 10,
  waitForConnections: true,
  namedPlaceholders: true,
  timezone: "Z",
});

let initPromise = null;

// 테이블 역할 설명은 DB 관리 도구에서 바로 확인할 수 있도록 MySQL TABLE COMMENT로 반영합니다.
const SCHEMA_TABLE_COMMENTS = {
  users: "회원 계정, 권한, 암호화된 개인정보, 포인트 잔액을 저장합니다.",
  sessions: "로그인 유지용 서버 세션 토큰과 만료 시각을 저장합니다.",
  email_verifications: "회원가입과 계정 복구에 쓰는 이메일 인증번호 상태를 저장합니다.",
  products: "결제 가능한 상품의 가격과 설명 정보를 저장합니다.",
  academy_videos: "교육 영상 상품의 강의 메타데이터와 공개 상태를 저장합니다.",
  academy_progress: "회원별 강의 단위 학습 진도 상태를 저장합니다.",
  academy_video_chapters: "강의에 속한 차시별 영상과 재생 정보를 저장합니다.",
  academy_chapter_progress: "회원별 차시 단위 학습 진도 상태를 저장합니다.",
  academy_playback_sessions: "동시 재생 제한과 보안 재생 토큰 검증 상태를 저장합니다.",
  cart_items: "회원 장바구니에 담긴 상품과 수량을 저장합니다.",
  orders: "결제 전후 주문 원장과 구매 상품 payload를 저장합니다.",
  payment_confirmations: "PortOne 결제 검증 결과와 주문 반영 상태를 저장합니다.",
  payment_webhook_events: "PortOne V2 웹훅 수신 이력과 처리 결과를 저장합니다.",
  social_feed_cache: "외부 소셜 채널에서 가져온 최신 게시글 캐시를 저장합니다.",
  review_posts: "커뮤니티 후기 게시글을 저장합니다.",
  review_comments: "커뮤니티 후기 댓글을 저장합니다.",
  events: "커뮤니티 이벤트 게시글과 노출 상태를 저장합니다.",
  inquiry_posts: "커뮤니티 문의 게시글과 비밀글 상태를 저장합니다.",
  inquiry_replies: "커뮤니티 문의 답변을 저장합니다.",
  refund_requests: "회원 환불 신청과 관리자 처리 결과를 저장합니다.",
  point_history: "회원 포인트 적립과 차감 내역을 저장합니다.",
  admin_page_overrides: "관리자 페이지 편집에서 저장한 위치, 이미지, 문구 오버라이드를 저장합니다.",
  instructors: "브랜드 소개에 노출할 강사 프로필을 저장합니다.",
  branches: "브랜드 소개에 노출할 지점 위치와 연락처를 저장합니다.",
  academy_reviews: "교육 영상 상세의 수강평을 저장합니다.",
  academy_qna_posts: "교육 영상 Q&A 질문 게시글을 저장합니다.",
  academy_qna_replies: "교육 영상 Q&A 답변을 저장합니다.",
  video_grants: "관리자가 회원에게 부여한 영상 수강 권한을 저장합니다.",
  login_rate_limits: "로그인 실패 횟수와 일시 차단 상태를 IP별로 저장합니다.",
  signup_rate_limits: "회원가입 요청 빈도 제한 상태를 IP별로 저장합니다.",
};

// 테이블/컬럼별 상세 용도 설명 코멘트 정의
const SCHEMA_COLUMN_COMMENTS = {
  users: {
    id: "회원 레코드 고유 식별자 값",
    login_id: "로그인 인증에 사용하는 계정 아이디 값",
    name: "회원 화면 표시에 사용하는 이름 값",
    email: "이메일 인증 및 알림 발송용 이메일 주소 값",
    password: "해시 처리된 비밀번호 저장 값",
    phone: "본인확인 및 연락용 휴대폰 번호 값",
    role: "권한 분기 판단용 역할 코드 값",
    is_admin: "관리자 화면 접근 판단용 플래그 값",
    user_grade: "회원 등급 혜택 계산용 등급 코드 값",
    birth_year_encrypted: "연령대 통계 산출용 출생연도 암호화 값",
    points: "포인트 적립/차감 계산 기준 잔액 값",
    account_status: "계정 활성/탈퇴 상태 판별 값",
    withdrawn_at: "회원 탈퇴 처리 완료 시각 값",
    withdrawal_purge_at: "탈퇴 회원 데이터 파기 예정 시각 값",
    restored_at: "탈퇴 계정 복구 처리 시각 값",
    marketing_agree: "마케팅 정보 수신 동의 여부 값",
    marketing_agreed_at: "마케팅 동의 처리 시각 값",
    created_at: "회원 가입 생성 시각 값",
  },
  sessions: {
    token: "로그인 유지 인증용 세션 토큰 값",
    user_id: "세션 소유 회원 식별자 값",
    created_at: "세션 발급 시각 값",
  },
  products: {
    id: "상품 고유 식별자 값",
    name: "상품 목록/결제창 표시용 이름 값",
    price: "결제 금액 계산 기준 판매가 값",
    description: "상품 상세 설명 본문 값",
    period: "수강 기간 정책 문자열 값",
  },
  academy_videos: {
    id: "강의 고유 식별자 값",
    product_id: "연결 결제 상품 식별자 값",
    instructor: "강의 카드 표기 강사명 값",
    category: "강의 필터링용 카테고리 값",
    badge: "강의 강조 표기용 배지 텍스트 값",
    original_price: "정가 표시/할인율 계산 기준 값",
    sale_price: "실 결제 판매가 기준 값",
    rating: "강의 평균 평점 표시 값",
    reviews: "강의 리뷰 개수 표시 값",
    image_path: "강의 대표 썸네일 파일 경로 값",
    video_path: "강의 기본 영상 파일 경로 값",
    publish_at: "강의 공개 시작 시각 제어 값",
    is_hidden: "강의 목록 노출/숨김 제어 플래그 값",
    created_at: "강의 데이터 생성 시각 값",
  },
  academy_progress: {
    user_id: "강의 진도 소유 회원 식별자 값",
    video_id: "진도 대상 강의 식별자 값",
    current_time: "이어보기 시작용 마지막 시청 위치 초 값",
    duration: "강의 전체 재생 길이 초 값",
    progress_percent: "강의 진도율 표시 퍼센트 값",
    completed: "강의 완강 여부 표시 플래그 값",
    last_watched_at: "강의 최근 시청 시각 값",
    created_at: "강의 진도 최초 생성 시각 값",
  },
  academy_video_chapters: {
    id: "강의 차시 고유 식별자 값",
    video_id: "소속 강의 식별자 값",
    chapter_order: "강의 내 차시 정렬 순서 값",
    title: "차시 목록 표기 제목 값",
    description: "차시 설명 문구 값",
    video_path: "차시 영상 파일 경로 값",
    duration_sec: "차시 재생 길이 초 값",
    is_preview: "비구매 사용자 미리보기 허용 플래그 값",
    created_at: "차시 데이터 생성 시각 값",
  },
  academy_chapter_progress: {
    user_id: "차시 진도 소유 회원 식별자 값",
    video_id: "차시가 속한 강의 식별자 값",
    chapter_id: "진도 대상 차시 식별자 값",
    current_time: "차시 이어보기 시작용 마지막 시청 초 값",
    duration: "차시 전체 재생 길이 초 값",
    progress_percent: "차시 진도율 표시 퍼센트 값",
    completed: "차시 완강 여부 표시 플래그 값",
    last_watched_at: "차시 최근 시청 시각 값",
    created_at: "차시 진도 최초 생성 시각 값",
  },
  academy_playback_sessions: {
    id: "보안 재생 세션 고유 식별자 값",
    user_id: "재생 세션 소유 회원 식별자 값",
    video_id: "재생 대상 강의 식별자 값",
    chapter_id: "재생 대상 차시 식별자 값",
    session_key: "재생 토큰 검증용 세션 키 값",
    status: "세션 활성/만료/해제 상태 값",
    ip_address: "동시 접속 판별용 접속 IP 값",
    user_agent: "접속 기기 판별용 에이전트 문자열 값",
    created_at: "재생 세션 생성 시각 값",
    last_seen_at: "heartbeat 기준 최근 활동 시각 값",
    expires_at: "재생 세션 만료 시각 값",
    revoked_at: "재생 세션 강제 해제 시각 값",
    revoke_reason: "세션 해제 사유 코드/문구 값",
  },
  cart_items: {
    user_id: "장바구니 소유 회원 식별자 값",
    product_id: "장바구니 상품 식별자 값",
    quantity: "장바구니 담기 수량 값",
    updated_at: "장바구니 마지막 수정 시각 값",
  },
  orders: {
    id: "주문 고유 식별자 값",
    order_name: "결제창/관리자 표시용 주문명 값",
    amount: "승인된 결제 금액 값",
    customer_email: "구매자 식별/조회용 이메일 값",
    payload: "주문 상세 데이터 JSON 저장 값",
    created_at: "주문 생성 시각 값",
  },
  social_feed_cache: {
    source: "외부 피드 소스 구분 키 값",
    label: "피드 소스 표시 라벨 값",
    title: "피드 항목 제목 값",
    url: "피드 원문 이동 URL 값",
    published_at: "피드 원문 게시 시각 값",
    excerpt: "피드 요약 미리보기 문구 값",
    thumbnail: "피드 썸네일 이미지 URL 값",
    is_live: "라이브 콘텐츠 여부 플래그 값",
    updated_at: "피드 캐시 갱신 시각 값",
  },
  review_posts: {
    id: "후기 게시글 고유 식별자 값",
    title: "후기 게시글 제목 값",
    content: "후기 게시글 본문 값",
    author: "작성자 표시 이름 값",
    author_id: "작성자 회원 식별자 값",
    date: "게시판 표시용 날짜 문자열 값",
    views: "후기 게시글 조회수 누적 값",
    created_at: "후기 게시글 생성 시각 값",
  },
  review_comments: {
    id: "후기 댓글 고유 식별자 값",
    review_id: "댓글 대상 후기 게시글 식별자 값",
    author: "댓글 작성자 표시 이름 값",
    content: "댓글 본문 내용 값",
    created_at: "댓글 생성 시각 문자열 값",
  },
  events: {
    id: "이벤트 고유 식별자 값",
    title: "이벤트 제목 표시 값",
    status: "이벤트 진행 상태 표시 값",
    start_date: "이벤트 시작일 문자열 값",
    end_date: "이벤트 종료일 문자열 값",
    likes: "이벤트 좋아요 누적 값",
    image: "이벤트 대표 이미지 경로 값",
    summary: "이벤트 요약 설명 문구 값",
  },
  inquiry_posts: {
    id: "문의 게시글 고유 식별자 값",
    title: "문의 게시글 제목 값",
    content: "문의 게시글 본문 값",
    author: "문의 작성자 표시 이름 값",
    author_id: "문의 작성자 회원 식별자 값",
    date: "문의 게시판 표시용 날짜 문자열 값",
    views: "문의 게시글 조회수 누적 값",
    is_secret: "비밀글 노출 제어 플래그 값",
    created_at: "문의 게시글 생성 시각 값",
  },
  inquiry_replies: {
    id: "문의 답변 고유 식별자 값",
    inquiry_id: "답변 대상 문의 게시글 식별자 값",
    author_id: "답변 작성자 회원 식별자 값",
    author_name: "답변 작성자 표시 이름 값",
    content: "답변 본문 내용 값",
    created_at: "답변 생성 시각 값",
  },
  point_history: {
    id: "포인트 이력 고유 식별자 값",
    user_id: "포인트 이력 소유 회원 식별자 값",
    amount: "포인트 증감 수치 값",
    reason: "포인트 증감 사유 문구 값",
    order_id: "연결 주문 식별자 값",
    created_at: "포인트 이력 생성 시각 값",
  },
  admin_page_overrides: {
    id: "관리자 커스터마이징 이력 식별자 값",
    override_type: "오버라이드 데이터 유형 구분 값",
    override_key: "적용 대상 요소 식별 키 값",
    override_value: "적용 설정 JSON 데이터 값",
    updated_at: "오버라이드 최종 수정 시각 값",
  },
  instructors: {
    id: "강사 고유 식별자 값",
    name: "강사명 표시 값",
    role: "강사 직책/타이틀 값",
    intro: "강사 소개 본문 값",
    careers: "강사 경력 목록 JSON 값",
    image_path: "강사 프로필 이미지 경로 값",
    sort_order: "강사 목록 정렬 순서 값",
    created_at: "강사 데이터 생성 시각 값",
  },
  branches: {
    id: "지점 고유 식별자 값",
    name: "지점명 표시 값",
    address: "지점 주소 값",
    phone: "지점 연락처 값",
    parking: "지점 주차 안내 문구 값",
    lat: "지점 지도 위도 좌표 값",
    lng: "지점 지도 경도 좌표 값",
    map_link: "지점 외부 지도 링크 URL 값",
    sort_order: "지점 목록 정렬 순서 값",
    created_at: "지점 데이터 생성 시각 값",
  },
  academy_reviews: {
    id: "강의 리뷰 고유 식별자 값",
    video_id: "리뷰 대상 강의 식별자 값",
    user_id: "리뷰 작성 회원 식별자 값",
    user_name: "리뷰 작성자 표시 이름 값",
    rating: "리뷰 평점 값",
    content: "리뷰 본문 내용 값",
    created_at: "리뷰 생성 시각 값",
  },
  academy_qna_posts: {
    id: "강의 Q&A 질문 고유 식별자 값",
    video_id: "질문 대상 강의 식별자 값",
    user_id: "질문 작성 회원 식별자 값",
    user_name: "질문 작성자 표시 이름 값",
    title: "질문 제목 값",
    content: "질문 본문 내용 값",
    is_secret: "질문 비밀글 여부 플래그 값",
    created_at: "질문 생성 시각 값",
  },
  academy_qna_replies: {
    id: "강의 Q&A 답변 고유 식별자 값",
    post_id: "답변 대상 질문 식별자 값",
    user_id: "답변 작성 회원 식별자 값",
    user_name: "답변 작성자 표시 이름 값",
    content: "답변 본문 내용 값",
    is_admin: "관리자 작성 답변 여부 플래그 값",
    created_at: "답변 생성 시각 값",
  },
};

// 최근 추가되었거나 개인정보 암호화 이후 생긴 컬럼의 DB 코멘트를 보강합니다.
const EXTRA_SCHEMA_COLUMN_COMMENTS = {
  users: {
    email_hash: "암호화된 이메일을 직접 복호화하지 않고 중복/조회하기 위한 검색 해시 값",
    phone_hash: "암호화된 전화번호를 직접 복호화하지 않고 본인확인 조회에 쓰는 검색 해시 값",
    name_hash: "암호화된 이름을 직접 복호화하지 않고 아이디 찾기에 쓰는 검색 해시 값",
    birth_year_encrypted: "연령대 통계 산출을 위해 암호화 저장한 출생연도 값",
  },
  sessions: {
    expires_at: "세션 자동 만료 시각 값",
  },
  email_verifications: {
    email: "인증번호 발송 대상 이메일 암호화 값",
    email_hash: "인증 대상 이메일을 조회하기 위한 검색 해시 값",
    code: "사용자에게 발송한 일회성 인증번호 값",
    expires_at: "인증번호 만료 시각 값",
    verified_at: "인증 성공 처리 시각 값",
    attempts: "인증번호 확인 실패 누적 횟수 값",
    send_count: "제한 시간 안의 인증번호 발송 횟수 값",
    first_sent_at: "발송 횟수 제한 기준이 되는 최초 발송 시각 값",
  },
  orders: {
    customer_email_hash: "주문자 이메일을 복호화하지 않고 주문을 조회하기 위한 검색 해시 값",
    cancelled_product_ids: "부분 환불로 접근 권한이 취소된 상품 ID 목록 JSON 값",
  },
  payment_confirmations: {
    order_id: "결제 검증 대상 주문 식별자 값",
    payment_id: "PortOne 결제 고유 식별자 값",
    user_id: "결제를 요청한 회원 식별자 값",
    customer_email: "결제자 이메일 암호화 값",
    customer_email_hash: "결제자 이메일 조회용 검색 해시 값",
    amount: "검증된 결제 금액 값",
    status: "결제 검증 및 반영 상태 값",
    payment_payload: "PortOne 결제 조회 응답 원문 JSON 값",
    confirmed_at: "결제 검증 완료 시각 값",
    consumed_at: "주문/수강권 반영 완료 시각 값",
    order_created_at: "연결된 주문 생성 시각 값",
  },
  payment_webhook_events: {
    webhook_id: "PortOne이 전달한 웹훅 이벤트 고유 식별자 값",
    event_type: "웹훅 이벤트 종류 값",
    payment_id: "웹훅과 연결된 PortOne 결제 식별자 값",
    payload: "웹훅 요청 본문 원문 JSON 값",
    process_status: "웹훅 처리 상태 값",
    process_message: "웹훅 처리 보조 메시지 값",
    received_at: "웹훅 최초 수신 시각 값",
    processed_at: "웹훅 처리 완료 시각 값",
    last_seen_at: "동일 웹훅 마지막 수신 시각 값",
    attempts: "동일 웹훅 수신 누적 횟수 값",
  },
  review_posts: {
    image_url: "후기 게시글 첨부 이미지 경로 값",
    video_url: "후기 게시글 첨부 영상 경로 값",
  },
  events: {
    content: "이벤트 상세 본문 내용 값",
    created_at: "이벤트 게시글 생성 시각 값",
  },
  inquiry_posts: {
    image_url: "문의 게시글 첨부 이미지 경로 값",
    video_url: "문의 게시글 첨부 영상 경로 값",
  },
  refund_requests: {
    id: "환불 신청 고유 식별자 값",
    order_id: "환불 신청 대상 주문 식별자 값",
    user_id: "환불을 신청한 회원 식별자 값",
    customer_email: "환불 신청자 이메일 암호화 값",
    customer_email_hash: "환불 신청자 이메일 조회용 검색 해시 값",
    selected_product_ids: "환불 신청 대상 상품 ID 목록 JSON 값",
    requested_amount: "환불 요청 금액 값",
    reason: "회원이 입력한 환불 사유 값",
    status: "환불 처리 상태 값",
    admin_note: "관리자 처리 메모 값",
    created_at: "환불 신청 생성 시각 값",
    resolved_at: "환불 승인 또는 거절 처리 시각 값",
  },
  video_grants: {
    id: "강의 권한 부여 이력 고유 식별자 값",
    user_id: "권한을 받은 회원 식별자 값",
    video_id: "접근 권한을 부여한 교육 영상 식별자 값",
    granted_by: "권한을 부여한 관리자 회원 식별자 값",
    duration_type: "권한 유지 기간 유형 값",
    expires_at: "권한 만료 시각 값",
    created_at: "권한 부여 시각 값",
  },
  login_rate_limits: {
    ip: "로그인 실패 횟수를 묶는 접속 IP 값",
    fail_count: "로그인 실패 누적 횟수 값",
    blocked_until: "로그인 시도가 차단되는 만료 시각 값",
    updated_at: "제한 상태 마지막 갱신 시각 값",
  },
  signup_rate_limits: {
    ip: "회원가입 시도 횟수를 묶는 접속 IP 값",
    attempt_count: "제한 시간 안의 회원가입 시도 횟수 값",
    window_start: "시도 횟수 제한 기준 시작 시각 값",
    updated_at: "제한 상태 마지막 갱신 시각 값",
  },
};

const NUMERIC_DATA_TYPES = new Set([
  "tinyint",
  "smallint",
  "mediumint",
  "int",
  "bigint",
  "decimal",
  "float",
  "double",
  "real",
  "year",
]);

// 함수 역할: SQL string 값을 SQL에 안전하게 넣을 수 있도록 이스케이프합니다.
function escapeSqlString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// 함수 역할: SQL ID 값을 SQL에 안전하게 넣을 수 있도록 이스케이프합니다.
function escapeSqlId(value) {
  return `\`${String(value || "").replace(/`/g, "``")}\``;
}

// 함수 역할: 운영 DB에 특정 테이블 컬럼이 존재하는지 안전하게 확인합니다.
async function databaseColumnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [String(tableName || ""), String(columnName || "")]
  );
  return Number(rows?.[0]?.count ?? 0) > 0;
}

// 함수 역할: 기본값 clause 상황에 맞는 값을 계산하거나 선택합니다.
function resolveDefaultClause(columnMeta) {
  const rawDefault = columnMeta.columnDefault;
  const nullable = String(columnMeta.isNullable || "").toUpperCase() === "YES";
  const dataType = String(columnMeta.dataType || "").toLowerCase();

  if (rawDefault === null || typeof rawDefault === "undefined") {
    return nullable ? " DEFAULT NULL" : "";
  }

  const raw = String(rawDefault);
  const upper = raw.toUpperCase();
  if (upper === "NULL") return " DEFAULT NULL";

  if (upper.includes("CURRENT_TIMESTAMP") || raw.startsWith("(") || /^b'.*'$/i.test(raw)) {
    return ` DEFAULT ${raw}`;
  }
  if (dataType === "json") {
    return ` DEFAULT ('${escapeSqlString(raw)}')`;
  }
  if (NUMERIC_DATA_TYPES.has(dataType) && /^-?\d+(\.\d+)?$/.test(raw)) {
    return ` DEFAULT ${raw}`;
  }

  return ` DEFAULT '${escapeSqlString(raw)}'`;
}

// 함수 역할: 댓글 modify definition 구조나 문구를 조립해 반환합니다.
function buildCommentModifyDefinition(columnMeta, commentText) {
  const definitionParts = [String(columnMeta.columnType || "VARCHAR(255)")];
  const nullable = String(columnMeta.isNullable || "").toUpperCase() === "YES";
  definitionParts.push(nullable ? "NULL" : "NOT NULL");
  definitionParts.push(resolveDefaultClause(columnMeta));

  let extra = String(columnMeta.extra || "").trim();
  if (extra) {
    extra = extra.replace(/\bDEFAULT_GENERATED\b/gi, "").trim();
    if (extra) definitionParts.push(extra);
  }

  definitionParts.push(`COMMENT '${escapeSqlString(commentText)}'`);
  return definitionParts.join(" ").replace(/\s+/g, " ").trim();
}

// 함수 역할: 기본 컬럼 설명과 보강 컬럼 설명을 테이블별로 병합합니다.
function getMergedSchemaColumnComments() {
  const merged = {};
  for (const source of [SCHEMA_COLUMN_COMMENTS, EXTRA_SCHEMA_COLUMN_COMMENTS]) {
    for (const [tableName, columns] of Object.entries(source || {})) {
      merged[tableName] = { ...(merged[tableName] || {}), ...(columns || {}) };
    }
  }
  return merged;
}

// 함수 역할: DB 테이블 코멘트를 실제 운영 스키마에 반영합니다.
async function applySchemaTableComments() {
  const [tableRows] = await pool.query(
    `SELECT TABLE_NAME AS tableName, TABLE_COMMENT AS tableComment
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()`
  );
  const tableMap = new Map((Array.isArray(tableRows) ? tableRows : []).map((row) => [row.tableName, row]));

  for (const [tableName, commentText] of Object.entries(SCHEMA_TABLE_COMMENTS)) {
    const tableMeta = tableMap.get(tableName);
    if (!tableMeta) continue;
    if (String(tableMeta.tableComment || "") === String(commentText || "")) continue;

    try {
      await pool.query(`ALTER TABLE ${escapeSqlId(tableName)} COMMENT = '${escapeSqlString(commentText)}'`);
    } catch (error) {
      console.warn(`[db] table comment update skipped: ${tableName}`, error?.message || error);
    }
  }
}

// 함수 역할: 스키마 컬럼 댓글 변경값을 실제 대상에 적용합니다.
async function applySchemaColumnComments() {
  const [columnRows] = await pool.query(
    `SELECT
      TABLE_NAME AS tableName,
      COLUMN_NAME AS columnName,
      COLUMN_TYPE AS columnType,
      IS_NULLABLE AS isNullable,
      COLUMN_DEFAULT AS columnDefault,
      EXTRA AS extra,
      DATA_TYPE AS dataType,
      COLUMN_COMMENT AS columnComment
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()`
  );

  const rows = Array.isArray(columnRows) ? columnRows : [];
  const columnMap = new Map(rows.map((row) => [`${row.tableName}.${row.columnName}`, row]));
  const mergedColumnComments = getMergedSchemaColumnComments();

  for (const [tableName, columns] of Object.entries(mergedColumnComments)) {
    for (const [columnName, commentText] of Object.entries(columns || {})) {
      const key = `${tableName}.${columnName}`;
      const columnMeta = columnMap.get(key);
      if (!columnMeta) continue;
      if (String(columnMeta.columnComment || "") === String(commentText || "")) continue;

      try {
        const definition = buildCommentModifyDefinition(columnMeta, commentText);
        await pool.query(
          `ALTER TABLE ${escapeSqlId(tableName)} MODIFY COLUMN ${escapeSqlId(columnName)} ${definition}`
        );
      } catch (error) {
        console.warn(`[db] column comment update skipped: ${key}`, error?.message || error);
      }
    }
  }
}

// 함수 역할: unused 스키마 objects에서 더 이상 쓰지 않는 항목을 제거합니다.
async function dropUnusedSchemaObjects() {
  // birth_year는 개인정보 암호화 전환 전에 쓰던 평문 출생연도 컬럼입니다.
  // encryptExistingUserPii()가 birth_year_encrypted로 값을 옮긴 뒤에는 더 이상 코드에서 조회하지 않으므로 제거합니다.
  const hasPlainBirthYear = await databaseColumnExists("users", "birth_year");
  const hasEncryptedBirthYear = await databaseColumnExists("users", "birth_year_encrypted");
  if (hasPlainBirthYear && hasEncryptedBirthYear) {
    await pool.query(`ALTER TABLE users DROP COLUMN birth_year`);
  }
}

// 함수 역할: 이전에 시드로 삽입된 하드코딩 데이터를 DB에서 일괄 제거합니다.
async function purgeAllHardcodedSeedData() {
  const productIds = [
    "video-1","video-2","video-3","video-4","video-5",
    "video-6","video-7","video-8","video-9","video-10",
    "starter","cueing","premium",
  ];
  const reviewIds = [
    "review-101","review-100","review-099","review-098","review-097",
    "review-096","review-095","review-094","review-093","review-092","review-091",
  ];
  const eventIds = ["event-1","event-2","event-3","event-4","event-5","event-6"];
  const inquiryIds = ["inquiry-301","inquiry-300","inquiry-299"];
  const instructorIds = ["instructor-1","instructor-2","instructor-3"];
  const branchIds = ["branch-1","branch-2"];

  function ph(arr) { return arr.map(() => "?").join(","); }

  await pool.query(`DELETE FROM products WHERE id IN (${ph(productIds)})`, productIds);
  await pool.query(`DELETE FROM review_posts WHERE id IN (${ph(reviewIds)})`, reviewIds);
  await pool.query(`DELETE FROM events WHERE id IN (${ph(eventIds)})`, eventIds);
  await pool.query(`DELETE FROM inquiry_posts WHERE id IN (${ph(inquiryIds)})`, inquiryIds);
  await pool.query(`DELETE FROM instructors WHERE id IN (${ph(instructorIds)})`, instructorIds);
  await pool.query(`DELETE FROM branches WHERE id IN (${ph(branchIds)})`, branchIds);
}



// 함수 역할: 만료된 탈퇴 회원 데이터를 조건에 맞게 영구 정리합니다.
function readExistingPiiValue(value) {
  const raw = String(value || "");
  if (!raw) return { raw, plain: "", encrypted: false, readable: true };
  if (!isEncryptedPii(raw)) return { raw, plain: raw, encrypted: false, readable: true };

  const plain = decryptPii(raw);
  return { raw, plain, encrypted: true, readable: Boolean(plain) };
}

function resolveEncryptedPiiValue(info, normalizedValue, { nullable = false } = {}) {
  if (!normalizedValue) {
    if (info.encrypted && !info.readable) return info.raw;
    return nullable ? null : "";
  }

  if (!info.encrypted || shouldReencryptPii(info.raw)) {
    return encryptPii(normalizedValue);
  }

  return info.raw;
}

async function encryptExistingUserPii() {
  const hasPlainBirthYear = await databaseColumnExists("users", "birth_year");
  const birthYearSelect = hasPlainBirthYear ? "birth_year AS birthYear" : "NULL AS birthYear";
  const [rows] = await pool.query(
    `SELECT id, name, email, phone, ${birthYearSelect}, birth_year_encrypted AS birthYearEncrypted
     FROM users`
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    const nameValue = readExistingPiiValue(row.name);
    const emailValue = readExistingPiiValue(row.email);
    const phoneValue = readExistingPiiValue(row.phone);
    const birthYearValue = readExistingPiiValue(row.birthYearEncrypted);
    const decryptedName = normalizeName(nameValue.plain);
    const decryptedEmail = normalizeEmail(emailValue.plain);
    const decryptedPhone = normalizePhone(phoneValue.plain);
    const decryptedBirthYear =
      normalizeBirthYear(birthYearValue.plain) ||
      normalizeBirthYear(row.birthYear);

    if (!decryptedEmail) continue;

    await pool.query(
      `UPDATE users
       SET name = ?,
           email = ?,
           phone = ?,
           email_hash = ?,
           phone_hash = ?,
           name_hash = ?,
           birth_year_encrypted = ?
       WHERE id = ?`,
      [
        resolveEncryptedPiiValue(nameValue, decryptedName),
        resolveEncryptedPiiValue(emailValue, decryptedEmail),
        resolveEncryptedPiiValue(phoneValue, decryptedPhone, { nullable: true }),
        emailHash(decryptedEmail),
        phoneHash(decryptedPhone),
        nameHash(decryptedName),
        resolveEncryptedPiiValue(birthYearValue, decryptedBirthYear, { nullable: true }),
        row.id,
      ]
    );
  }
}

async function encryptExistingOrderPii() {
  const [rows] = await pool.query(`SELECT id, customer_email AS customerEmail, payload FROM orders`);

  for (const row of Array.isArray(rows) ? rows : []) {
    const decryptedEmail = normalizeEmail(decryptPii(row.customerEmail) || row.customerEmail);
    let payload = {};
    try {
      payload = typeof row.payload === "object" ? row.payload : JSON.parse(row.payload || "{}");
    } catch {
      payload = {};
    }

    if (payload && typeof payload === "object") {
      delete payload.customerEmail;
      delete payload.customerBirthYear;
      delete payload.birthYear;
      if (payload.customer && typeof payload.customer === "object") {
        delete payload.customer.email;
        delete payload.customer.birthYear;
      }
    }

    const encryptedEmail = decryptedEmail
      ? isEncryptedPii(row.customerEmail)
        ? row.customerEmail
        : encryptPii(decryptedEmail)
      : null;

    await pool.query(
      `UPDATE orders
       SET customer_email = ?,
           customer_email_hash = ?,
           payload = ?
       WHERE id = ?`,
      [
        encryptedEmail,
        emailHash(decryptedEmail),
        JSON.stringify(payload || {}),
        row.id,
      ]
    );
  }
}

async function encryptExistingPaymentPii() {
  const [rows] = await pool.query(
    `SELECT order_id AS orderId, customer_email AS customerEmail, payment_payload AS paymentPayload
     FROM payment_confirmations`
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    const decryptedEmail = normalizeEmail(decryptPii(row.customerEmail) || row.customerEmail);
    const payloadText =
      typeof row.paymentPayload === "string"
        ? row.paymentPayload
        : JSON.stringify(row.paymentPayload || {});
    const encryptedEmail = decryptedEmail
      ? isEncryptedPii(row.customerEmail)
        ? row.customerEmail
        : encryptPii(decryptedEmail)
      : null;
    const encryptedPayload = payloadText
      ? isEncryptedPii(payloadText)
        ? payloadText
        : encryptPii(payloadText)
      : null;
    await pool.query(
      `UPDATE payment_confirmations
       SET customer_email = ?,
           customer_email_hash = ?,
           payment_payload = ?
       WHERE order_id = ?`,
      [
        encryptedEmail,
        emailHash(decryptedEmail),
        encryptedPayload,
        row.orderId,
      ]
    );
  }
}

async function encryptExistingRefundPii() {
  const [rows] = await pool.query(`SELECT id, customer_email AS customerEmail FROM refund_requests`);

  for (const row of Array.isArray(rows) ? rows : []) {
    const decryptedEmail = normalizeEmail(decryptPii(row.customerEmail) || row.customerEmail);
    const encryptedEmail = decryptedEmail
      ? isEncryptedPii(row.customerEmail)
        ? row.customerEmail
        : encryptPii(decryptedEmail)
      : null;
    await pool.query(
      `UPDATE refund_requests
       SET customer_email = ?,
           customer_email_hash = ?
       WHERE id = ?`,
      [
        encryptedEmail,
        emailHash(decryptedEmail),
        row.id,
      ]
    );
  }
}

async function encryptExistingPiiData() {
  await encryptExistingUserPii();
  await encryptExistingOrderPii();
  await encryptExistingPaymentPii();
  await encryptExistingRefundPii();
}

async function purgeExpiredWithdrawnUsers() {
  // 탈퇴 보관 기간 만료 사용자 조회 및 연관 데이터 정리 처리
  const [rows] = await pool.query(
    `SELECT id
     FROM users
     WHERE account_status = 'withdrawn'
       AND withdrawal_purge_at IS NOT NULL
       AND withdrawal_purge_at <= NOW()
     LIMIT 500`
  );

  for (const row of Array.isArray(rows) ? rows : []) {
    const userId = String(row?.id || "").trim();
    if (!userId) continue;

    await pool.query(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
    await pool.query(`DELETE FROM cart_items WHERE user_id = ?`, [userId]);
    await pool.query(`DELETE FROM point_history WHERE user_id = ?`, [userId]);
    await pool.query(`DELETE FROM academy_reviews WHERE user_id = ?`, [userId]);
    await pool.query(`DELETE FROM academy_qna_replies WHERE user_id = ?`, [userId]);
    await pool.query(`DELETE FROM academy_qna_posts WHERE user_id = ?`, [userId]);
    await pool.query(`DELETE FROM inquiry_replies WHERE author_id = ?`, [userId]);
    await pool.query(`UPDATE review_posts SET author_id = NULL WHERE author_id = ?`, [userId]);
    await pool.query(`UPDATE inquiry_posts SET author_id = NULL WHERE author_id = ?`, [userId]);
    await pool.query(`DELETE FROM users WHERE id = ?`, [userId]);
  }
}

// 함수 역할: legacy 깨진 문자 data 문제를 자동으로 보정합니다.
async function repairLegacyMojibakeData() {
  // 과거 인코딩 깨짐으로 저장된 카테고리/기간 값을 정상 데이터로 정리
  await pool.query(
    `UPDATE academy_videos
     SET category = CASE category
       WHEN '?낅Ц' THEN '입문'
       WHEN '珥덇툒' THEN '초급'
       WHEN '以묎툒' THEN '중급'
       WHEN '怨좉툒' THEN '고급'
       ELSE category
     END
     WHERE category IN ('?낅Ц', '珥덇툒', '以묎툒', '怨좉툒')`
  );

  await pool.query(
    `UPDATE products
     SET period = '무제한 수강'
     WHERE period IN ('臾댁젣???섍컯', '?얜똻?????띿뺏')`
  );
}

// 함수 역할: utf8mb4 테이블 문자셋 상태가 없을 때 생성해 항상 존재하도록 보장합니다.
async function ensureUtf8mb4TableCollation() {
  const targetTables = [
    "users",
    "products",
    "academy_videos",
    "academy_video_chapters",
    "orders",
    "review_posts",
    "inquiry_posts",
    "events",
  ];

  const rows = await query(
    `SELECT TABLE_NAME AS tableName, TABLE_COLLATION AS tableCollation
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()`
  );

  const byTable = new Map((Array.isArray(rows) ? rows : []).map((row) => [String(row.tableName || ""), row]));

  for (const tableName of targetTables) {
    const row = byTable.get(tableName);
    if (!row?.tableName) continue;

    const collation = String(row.tableCollation || "").toLowerCase();
    if (collation.startsWith("utf8mb4")) continue;

    try {
      await pool.query(
        `ALTER TABLE ${escapeSqlId(tableName)} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } catch (error) {
      console.warn(`[db] failed to convert collation for ${tableName}`, error?.message || error);
    }
  }
}

// 함수 역할: 앱 실행에 필요한 테이블과 기본 데이터를 준비합니다.
async function seedDemoAdminIfEnabled() {
  if (!env.demoAdminEnabled) return;

  const loginId = String(env.demoAdminLoginId || "").trim();
  const password = String(env.demoAdminPassword || "").trim();
  const email = String(env.demoAdminEmail || "").trim().toLowerCase();
  const name = String(env.demoAdminName || "").trim() || "Demo Admin";

  if (!loginId || !password || !email) {
    console.warn("[demo] DEMO_ADMIN_ENABLED is true, but demo admin credentials are incomplete.");
    return;
  }

  const passwordHash = await hashPassword(password);
  const piiValues = encryptedUserValues({ name, email, phone: "", birthYear: null });
  const [rows] = await pool.execute(
    `SELECT id FROM users WHERE login_id = ? OR email_hash = ? OR email = ? LIMIT 1`,
    [loginId, piiValues.emailHash, email]
  );
  const existingId = Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : "";

  if (existingId) {
    await pool.execute(
      `UPDATE users
       SET login_id = ?,
           name = ?,
           email = ?,
           email_hash = ?,
           phone_hash = ?,
           name_hash = ?,
           password = ?,
           role = 'admin',
           is_admin = 1,
           user_grade = 'admin0',
           account_status = 'active',
           withdrawn_at = NULL,
           withdrawal_purge_at = NULL
       WHERE id = ?`,
      [
        loginId,
        piiValues.encryptedName,
        piiValues.encryptedEmail,
        piiValues.emailHash,
        piiValues.phoneHash,
        piiValues.nameHash,
        passwordHash,
        existingId,
      ]
    );
    return;
  }

  await pool.execute(
    `INSERT INTO users (
      id,
      login_id,
      name,
      email,
      email_hash,
      phone_hash,
      name_hash,
      password,
      role,
      is_admin,
      user_grade,
      account_status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 1, 'admin0', 'active', NOW())`,
    [
      "demo-admin",
      loginId,
      piiValues.encryptedName,
      piiValues.encryptedEmail,
      piiValues.emailHash,
      piiValues.phoneHash,
      piiValues.nameHash,
      passwordHash,
    ]
  );
}

async function initDatabase() {
  // users 테이블은 서비스 확장 과정에서 컬럼이 늘어났기 때문에,
  // 존재 여부를 확인하면서 점진적으로 스키마를 보정한다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      login_id VARCHAR(80) NOT NULL UNIQUE,
      name VARCHAR(512) NOT NULL,
      email VARCHAR(512) NOT NULL,
      email_hash VARCHAR(80) NULL,
      phone_hash VARCHAR(80) NULL,
      name_hash VARCHAR(80) NULL,
      password VARCHAR(255) NOT NULL,
      phone VARCHAR(512) NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'user',
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      user_grade VARCHAR(20) NOT NULL DEFAULT 'member',
      birth_year_encrypted VARCHAR(512) NULL,
      points INT NOT NULL DEFAULT 0,
      account_status VARCHAR(20) NOT NULL DEFAULT 'active',
      withdrawn_at DATETIME NULL,
      withdrawal_purge_at DATETIME NULL,
      restored_at DATETIME NULL,
      marketing_agree TINYINT(1) NOT NULL DEFAULT 0,
      marketing_agreed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY ux_users_email_hash (email_hash)
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
  await pool.query(`ALTER TABLE users MODIFY name VARCHAR(512) NOT NULL`);
  await pool.query(`ALTER TABLE users MODIFY email VARCHAR(512) NOT NULL`);
  await pool.query(`ALTER TABLE users MODIFY phone VARCHAR(512) NULL`);

  const piiUserColumns = [
    ["email_hash", "VARCHAR(80) NULL AFTER email"],
    ["phone_hash", "VARCHAR(80) NULL AFTER phone"],
    ["name_hash", "VARCHAR(80) NULL AFTER name"],
  ];
  for (const [columnName, definition] of piiUserColumns) {
    const [columnRows] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = ?`,
      [columnName]
    );
    if (Number(columnRows?.[0]?.count ?? 0) === 0) {
      await pool.query(`ALTER TABLE users ADD COLUMN ${escapeSqlId(columnName)} ${definition}`);
    }
  }

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

  const [userGradeColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'user_grade'`
  );
  const hasUserGradeColumn = Number(userGradeColumnRows?.[0]?.count ?? 0) > 0;

  if (!hasUserGradeColumn) {
    await pool.query(`ALTER TABLE users ADD COLUMN user_grade VARCHAR(20) NULL AFTER is_admin`);
  }

  await pool.query(
    `UPDATE users
     SET user_grade =
       CASE
         WHEN user_grade IN ('admin0', 'admin1', 'member', 'vip', 'vvip') THEN user_grade
         WHEN LOWER(role) = 'admin1' THEN 'admin1'
         WHEN is_admin = 1 OR LOWER(role) = 'admin' THEN 'admin0'
         WHEN LOWER(role) = 'vip' THEN 'vip'
         WHEN LOWER(role) = 'vvip' THEN 'vvip'
         ELSE 'member'
       END
     WHERE user_grade IS NULL OR user_grade = '' OR user_grade NOT IN ('admin0', 'admin1', 'member', 'vip', 'vvip')`
  );

  await pool.query(`ALTER TABLE users MODIFY user_grade VARCHAR(20) NOT NULL DEFAULT 'member'`);

  const [birthYearEncryptedRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'birth_year_encrypted'`
  );
  if (Number(birthYearEncryptedRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN birth_year_encrypted VARCHAR(512) NULL AFTER user_grade`);
  }

  // users.points 컬럼 (포인트 잔액)
  const [pointsColRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'points'`
  );
  if (Number(pointsColRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0 AFTER birth_year_encrypted`);
  }

  const [accountStatusColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'account_status'`
  );
  const hasAccountStatusColumn = Number(accountStatusColumnRows?.[0]?.count ?? 0) > 0;

  if (!hasAccountStatusColumn) {
    await pool.query(`ALTER TABLE users ADD COLUMN account_status VARCHAR(20) NULL AFTER points`);
  }

  await pool.query(
    `UPDATE users
     SET account_status = 'active'
     WHERE account_status IS NULL
        OR account_status = ''
        OR account_status NOT IN ('active', 'withdrawn')`
  );

  await pool.query(`ALTER TABLE users MODIFY account_status VARCHAR(20) NOT NULL DEFAULT 'active'`);

  // 탈퇴 시각/폐기 시각/복구 시각 컬럼 보정 처리
  const [withdrawnAtColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'withdrawn_at'`
  );
  if (Number(withdrawnAtColumnRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN withdrawn_at DATETIME NULL AFTER account_status`);
  }

  const [withdrawalPurgeAtColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'withdrawal_purge_at'`
  );
  if (Number(withdrawalPurgeAtColumnRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN withdrawal_purge_at DATETIME NULL AFTER withdrawn_at`);
  }

  const [restoredAtColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'restored_at'`
  );
  if (Number(restoredAtColumnRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN restored_at DATETIME NULL AFTER withdrawal_purge_at`);
  }

  // users.marketing_agree / marketing_agreed_at 컬럼 보정 처리
  const [marketingAgreeColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'marketing_agree'`
  );
  if (Number(marketingAgreeColumnRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN marketing_agree TINYINT(1) NOT NULL DEFAULT 0 AFTER restored_at`);
    await pool.query(`ALTER TABLE users ADD COLUMN marketing_agreed_at DATETIME NULL AFTER marketing_agree`);
  }

  await seedDemoAdminIfEnabled();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(120) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL,
      expires_at DATETIME NULL,
      INDEX idx_sessions_user_id (user_id),
      CONSTRAINT fk_sessions_users
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )
  `);

  // expires_at 컬럼 없는 기존 테이블 보정
  const [sessExpiresRows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'expires_at'`
  );
  if (Number(sessExpiresRows?.[0]?.cnt ?? 0) === 0) {
    await pool.query(`ALTER TABLE sessions ADD COLUMN expires_at DATETIME NULL`);
    await pool.query(
      `UPDATE sessions SET expires_at = DATE_ADD(created_at, INTERVAL 14 DAY) WHERE expires_at IS NULL`
    );
  }
  await pool.query(`DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < NOW()`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      email VARCHAR(512) PRIMARY KEY,
      email_hash VARCHAR(80) NULL,
      code VARCHAR(10) NOT NULL,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      attempts INT NOT NULL DEFAULT 0,
      send_count INT NOT NULL DEFAULT 1,
      first_sent_at DATETIME NULL
    )
  `);

  await pool.query(`ALTER TABLE email_verifications MODIFY email VARCHAR(512) NOT NULL`);
  const [evEmailHashRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_verifications' AND COLUMN_NAME = 'email_hash'`
  );
  if (Number(evEmailHashRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE email_verifications ADD COLUMN email_hash VARCHAR(80) NULL AFTER email`);
  }

  const [evAttemptsRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_verifications' AND COLUMN_NAME = 'attempts'`
  );
  if (Number(evAttemptsRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE email_verifications ADD COLUMN attempts INT NOT NULL DEFAULT 0`);
  }

  const [evSendCountRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_verifications' AND COLUMN_NAME = 'send_count'`
  );
  if (Number(evSendCountRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE email_verifications ADD COLUMN send_count INT NOT NULL DEFAULT 1`);
    await pool.query(`ALTER TABLE email_verifications ADD COLUMN first_sent_at DATETIME NULL`);
  }

  await pool.query(`DELETE FROM email_verifications WHERE expires_at < NOW() OR email_hash IS NULL`);
  await pool.query(`
    DELETE ev1 FROM email_verifications ev1
    INNER JOIN email_verifications ev2
      ON ev1.email_hash = ev2.email_hash
      AND ev1.email <> ev2.email
      AND ev1.expires_at <= ev2.expires_at
  `);
  const [evEmailHashIndexRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'email_verifications'
       AND INDEX_NAME = 'ux_email_verifications_email_hash'`
  );
  if (Number(evEmailHashIndexRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE email_verifications ADD UNIQUE INDEX ux_email_verifications_email_hash (email_hash)`);
  }

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
    CREATE TABLE IF NOT EXISTS academy_videos (
      id VARCHAR(80) PRIMARY KEY,
      product_id VARCHAR(64) NOT NULL UNIQUE,
      instructor VARCHAR(120) NOT NULL,
      category VARCHAR(40) NOT NULL,
      badge VARCHAR(20) NULL,
      original_price INT NOT NULL DEFAULT 0,
      sale_price INT NOT NULL DEFAULT 0,
      rating DECIMAL(3,1) NOT NULL DEFAULT 0,
      reviews INT NOT NULL DEFAULT 0,
      image_path TEXT NULL,
      video_path TEXT NULL,
      publish_at DATETIME NULL,
      is_hidden TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      INDEX idx_academy_videos_created_at (created_at),
      CONSTRAINT fk_academy_videos_products
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE
    )
  `);

  const [academyPublishColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'academy_videos'
       AND COLUMN_NAME = 'publish_at'`
  );
  const hasAcademyPublishColumn = Number(academyPublishColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasAcademyPublishColumn) {
    await pool.query(`ALTER TABLE academy_videos ADD COLUMN publish_at DATETIME NULL AFTER video_path`);
  }

  if (!hasAcademyPublishColumn) {
    await pool.query(
      `UPDATE academy_videos
       SET publish_at = created_at
       WHERE publish_at IS NULL`
    );
  }

  const [academyHiddenColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'academy_videos'
       AND COLUMN_NAME = 'is_hidden'`
  );
  const hasAcademyHiddenColumn = Number(academyHiddenColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasAcademyHiddenColumn) {
    await pool.query(`ALTER TABLE academy_videos ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER publish_at`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academy_progress (
      user_id VARCHAR(64) NOT NULL,
      video_id VARCHAR(80) NOT NULL,
      \`current_time\` INT NOT NULL DEFAULT 0,
      duration INT NOT NULL DEFAULT 0,
      progress_percent INT NOT NULL DEFAULT 0,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      last_watched_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (user_id, video_id),
      INDEX idx_academy_progress_last_watched (last_watched_at),
      CONSTRAINT fk_academy_progress_users
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_academy_progress_videos
        FOREIGN KEY (video_id) REFERENCES academy_videos(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academy_video_chapters (
      id VARCHAR(120) PRIMARY KEY,
      video_id VARCHAR(80) NOT NULL,
      chapter_order INT NOT NULL DEFAULT 1,
      title VARCHAR(190) NOT NULL,
      description TEXT NULL,
      video_path TEXT NULL,
      duration_sec INT NOT NULL DEFAULT 0,
      is_preview TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      UNIQUE KEY ux_academy_video_chapters_order (video_id, chapter_order),
      INDEX idx_academy_video_chapters_video (video_id),
      CONSTRAINT fk_academy_video_chapters_video
        FOREIGN KEY (video_id) REFERENCES academy_videos(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academy_chapter_progress (
      user_id VARCHAR(64) NOT NULL,
      video_id VARCHAR(80) NOT NULL,
      chapter_id VARCHAR(120) NOT NULL,
      \`current_time\` INT NOT NULL DEFAULT 0,
      duration INT NOT NULL DEFAULT 0,
      progress_percent INT NOT NULL DEFAULT 0,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      last_watched_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (user_id, chapter_id),
      INDEX idx_academy_chapter_progress_video (video_id),
      INDEX idx_academy_chapter_progress_last_watched (last_watched_at),
      CONSTRAINT fk_academy_chapter_progress_users
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_academy_chapter_progress_videos
        FOREIGN KEY (video_id) REFERENCES academy_videos(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_academy_chapter_progress_chapters
        FOREIGN KEY (chapter_id) REFERENCES academy_video_chapters(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academy_playback_sessions (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NULL,
      video_id VARCHAR(80) NOT NULL,
      chapter_id VARCHAR(120) NOT NULL,
      session_key VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      ip_address VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      last_seen_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      revoke_reason VARCHAR(120) NULL,
      INDEX idx_academy_playback_user_status (user_id, status, last_seen_at),
      INDEX idx_academy_playback_expires (expires_at),
      INDEX idx_academy_playback_session_key (session_key)
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
      customer_email VARCHAR(512) NULL,
      customer_email_hash VARCHAR(80) NULL,
      payload JSON NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_orders_created_at (created_at),
      INDEX idx_orders_customer_email_hash (customer_email_hash)
    )
  `);

  await pool.query(`ALTER TABLE orders MODIFY customer_email VARCHAR(512) NULL`);
  const [ordersEmailHashRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME = 'customer_email_hash'`
  );
  if (Number(ordersEmailHashRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE orders ADD COLUMN customer_email_hash VARCHAR(80) NULL AFTER customer_email`);
  }
  const [ordersEmailHashIndexRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND INDEX_NAME = 'idx_orders_customer_email_hash'`
  );
  if (Number(ordersEmailHashIndexRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE orders ADD INDEX idx_orders_customer_email_hash (customer_email_hash)`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_confirmations (
      order_id VARCHAR(80) PRIMARY KEY,
      payment_id VARCHAR(120) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      customer_email VARCHAR(512) NOT NULL,
      customer_email_hash VARCHAR(80) NULL,
      amount INT NOT NULL,
      status VARCHAR(40) NOT NULL,
      payment_payload LONGTEXT NULL,
      confirmed_at DATETIME NOT NULL,
      consumed_at DATETIME NULL,
      order_created_at DATETIME NULL,
      UNIQUE KEY uq_payment_confirmations_payment (payment_id),
      INDEX idx_payment_confirmations_user (user_id),
      INDEX idx_payment_confirmations_consumed (consumed_at)
    )
  `);

  await pool.query(`ALTER TABLE payment_confirmations MODIFY customer_email VARCHAR(512) NOT NULL`);
  await pool.query(`ALTER TABLE payment_confirmations MODIFY payment_payload LONGTEXT NULL`);
  const [paymentEmailHashRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payment_confirmations'
       AND COLUMN_NAME = 'customer_email_hash'`
  );
  if (Number(paymentEmailHashRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE payment_confirmations ADD COLUMN customer_email_hash VARCHAR(80) NULL AFTER customer_email`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_webhook_events (
      webhook_id VARCHAR(160) PRIMARY KEY,
      event_type VARCHAR(80) NOT NULL,
      payment_id VARCHAR(120) NULL,
      payload LONGTEXT NULL,
      process_status VARCHAR(40) NOT NULL,
      process_message VARCHAR(500) NULL,
      received_at DATETIME NOT NULL,
      processed_at DATETIME NULL,
      last_seen_at DATETIME NOT NULL,
      attempts INT NOT NULL DEFAULT 1,
      INDEX idx_payment_webhook_events_payment (payment_id),
      INDEX idx_payment_webhook_events_status (process_status),
      INDEX idx_payment_webhook_events_received (received_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_feed_cache (
      source VARCHAR(40) PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      title VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      published_at DATETIME NULL,
      excerpt TEXT NULL,
      thumbnail TEXT NULL,
      is_live TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      INDEX idx_social_feed_cache_updated_at (updated_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_posts (
      id VARCHAR(80) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NULL,
      image_url TEXT NULL,
      video_url TEXT NULL,
      author VARCHAR(120) NOT NULL,
      author_id VARCHAR(80) NULL,
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

  const [reviewAuthorIdColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'review_posts'
       AND COLUMN_NAME = 'author_id'`
  );
  const hasReviewAuthorIdColumn = Number(reviewAuthorIdColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasReviewAuthorIdColumn) {
    await pool.query(`ALTER TABLE review_posts ADD COLUMN author_id VARCHAR(80) NULL AFTER author`);
  }

  const [reviewImageUrlColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'review_posts'
       AND COLUMN_NAME = 'image_url'`
  );
  const hasReviewImageUrlColumn = Number(reviewImageUrlColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasReviewImageUrlColumn) {
    await pool.query(`ALTER TABLE review_posts ADD COLUMN image_url TEXT NULL AFTER content`);
  }

  const [reviewVideoUrlColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'review_posts'
       AND COLUMN_NAME = 'video_url'`
  );
  const hasReviewVideoUrlColumn = Number(reviewVideoUrlColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasReviewVideoUrlColumn) {
    await pool.query(`ALTER TABLE review_posts ADD COLUMN video_url TEXT NULL AFTER image_url`);
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
      image_url TEXT NULL,
      video_url TEXT NULL,
      author VARCHAR(120) NOT NULL,
      author_id VARCHAR(80) NULL,
      date VARCHAR(20) NOT NULL,
      views INT NOT NULL DEFAULT 0,
      is_secret TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiry_replies (
      id VARCHAR(64) PRIMARY KEY,
      inquiry_id VARCHAR(80) NOT NULL,
      author_id VARCHAR(64) NOT NULL,
      author_name VARCHAR(120) NOT NULL DEFAULT '관리자',
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_inquiry_replies_inquiry (inquiry_id)
    )
  `);

  const [inquiryImageUrlColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inquiry_posts'
       AND COLUMN_NAME = 'image_url'`
  );
  const hasInquiryImageUrlColumn = Number(inquiryImageUrlColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasInquiryImageUrlColumn) {
    await pool.query(`ALTER TABLE inquiry_posts ADD COLUMN image_url TEXT NULL AFTER content`);
  }

  const [inquiryVideoUrlColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inquiry_posts'
       AND COLUMN_NAME = 'video_url'`
  );
  const hasInquiryVideoUrlColumn = Number(inquiryVideoUrlColumnRows?.[0]?.count ?? 0) > 0;
  if (!hasInquiryVideoUrlColumn) {
    await pool.query(`ALTER TABLE inquiry_posts ADD COLUMN video_url TEXT NULL AFTER image_url`);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_requests (
      id VARCHAR(80) PRIMARY KEY,
      order_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      customer_email VARCHAR(512) NOT NULL,
      customer_email_hash VARCHAR(80) NULL,
      selected_product_ids JSON NOT NULL,
      requested_amount INT NOT NULL DEFAULT 0,
      reason TEXT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      admin_note TEXT NULL,
      created_at DATETIME NOT NULL,
      resolved_at DATETIME NULL,
      INDEX idx_refund_requests_order (order_id),
      INDEX idx_refund_requests_user (user_id),
      INDEX idx_refund_requests_customer_email_hash (customer_email_hash),
      INDEX idx_refund_requests_status (status)
    )
  `);

  await pool.query(`ALTER TABLE refund_requests MODIFY customer_email VARCHAR(512) NOT NULL`);
  const [refundEmailHashRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'refund_requests'
       AND COLUMN_NAME = 'customer_email_hash'`
  );
  if (Number(refundEmailHashRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE refund_requests ADD COLUMN customer_email_hash VARCHAR(80) NULL AFTER customer_email`);
  }
  const [refundEmailHashIndexRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'refund_requests'
       AND INDEX_NAME = 'idx_refund_requests_customer_email_hash'`
  );
  if (Number(refundEmailHashIndexRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE refund_requests ADD INDEX idx_refund_requests_customer_email_hash (customer_email_hash)`);
  }

  const [cancelledColRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'orders'
       AND COLUMN_NAME = 'cancelled_product_ids'`
  );
  if (Number(cancelledColRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE orders ADD COLUMN cancelled_product_ids JSON NULL`);
  }

  await pool.query(
    `INSERT INTO academy_chapter_progress (
      user_id,
      video_id,
      chapter_id,
      \`current_time\`,
      duration,
      progress_percent,
      completed,
      last_watched_at,
      created_at
    )
    SELECT
      ap.user_id,
      ap.video_id,
      chapter.id AS chapter_id,
      ap.\`current_time\`,
      ap.duration,
      ap.progress_percent,
      ap.completed,
      ap.last_watched_at,
      ap.created_at
    FROM academy_progress ap
    INNER JOIN academy_video_chapters chapter
      ON chapter.video_id = ap.video_id
      AND chapter.chapter_order = 1
    LEFT JOIN academy_chapter_progress cp
      ON cp.user_id = ap.user_id
      AND cp.chapter_id = chapter.id
    WHERE cp.user_id IS NULL`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS point_history (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      amount INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      order_id VARCHAR(80) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_point_history_user (user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_page_overrides (
      id VARCHAR(80) PRIMARY KEY,
      override_type VARCHAR(30) NOT NULL,
      override_key VARCHAR(600) NOT NULL,
      override_value JSON NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uk_override (override_type, override_key(255))
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS instructors (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      role VARCHAR(120) NOT NULL,
      intro TEXT NOT NULL,
      careers JSON NOT NULL DEFAULT ('[]'),
      image_path VARCHAR(500) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      address VARCHAR(300) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      parking VARCHAR(200) NOT NULL DEFAULT '',
      lat DOUBLE NULL,
      lng DOUBLE NULL,
      map_link VARCHAR(500) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academy_reviews (
      id VARCHAR(80) PRIMARY KEY,
      video_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      user_name VARCHAR(120) NOT NULL,
      rating TINYINT NOT NULL DEFAULT 5,
      content TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY unique_academy_review (user_id, video_id),
      INDEX idx_academy_reviews_video (video_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academy_qna_posts (
      id VARCHAR(80) PRIMARY KEY,
      video_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      user_name VARCHAR(120) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_secret TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      INDEX idx_academy_qna_video (video_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS academy_qna_replies (
      id VARCHAR(80) PRIMARY KEY,
      post_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      user_name VARCHAR(120) NOT NULL,
      content TEXT NOT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      INDEX idx_academy_qna_replies_post (post_id),
      CONSTRAINT fk_academy_qna_replies_post
        FOREIGN KEY (post_id) REFERENCES academy_qna_posts(id)
        ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS video_grants (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      video_id VARCHAR(80) NOT NULL,
      granted_by VARCHAR(64) NOT NULL,
      duration_type ENUM('1d','7d','30d','unlimited') NOT NULL DEFAULT 'unlimited',
      expires_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_video_grants_user (user_id),
      INDEX idx_video_grants_video (video_id),
      UNIQUE KEY uq_video_grant_user_video (user_id, video_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_rate_limits (
      ip VARCHAR(64) NOT NULL PRIMARY KEY,
      fail_count INT NOT NULL DEFAULT 0,
      blocked_until DATETIME NULL,
      updated_at DATETIME NOT NULL
    )
  `);
  await pool.query(
    `DELETE FROM login_rate_limits WHERE blocked_until IS NOT NULL AND blocked_until < DATE_SUB(NOW(), INTERVAL 1 DAY)`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS signup_rate_limits (
      ip VARCHAR(64) NOT NULL PRIMARY KEY,
      attempt_count INT NOT NULL DEFAULT 0,
      window_start DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    )
  `);
  await pool.query(
    `DELETE FROM signup_rate_limits WHERE window_start < DATE_SUB(NOW(), INTERVAL 2 HOUR)`
  );

  await purgeAllHardcodedSeedData();
  await encryptExistingPiiData();
  await dropUnusedSchemaObjects();
  const [emailHashIndexRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND INDEX_NAME = 'ux_users_email_hash'`
  );
  if (Number(emailHashIndexRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD UNIQUE INDEX ux_users_email_hash (email_hash)`);
  }
  await ensureUtf8mb4TableCollation();
  await repairLegacyMojibakeData();
  await applySchemaTableComments();
  await applySchemaColumnComments();
  await purgeExpiredWithdrawnUsers();
}

// 함수 역할: DB 초기화가 한 번만 실행되도록 보장합니다.
async function ensureInitialized() {
  // 여러 요청이 동시에 들어와도 초기화는 한 번만 실행되도록 Promise를 공유한다.
  if (!initPromise) {
    initPromise = initDatabase().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
}

export { ensureInitialized };

// 함수 역할: DB 초기화가 끝난 뒤 SQL을 실행하고 결과 행 배열을 반환합니다.
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// 함수 역할: SQL 조회 결과 중 첫 번째 행만 반환합니다.
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

// 함수 역할: 트랜잭션 안에서 fn을 실행하고, 성공 시 커밋·실패 시 롤백합니다.
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// 함수 역할: 서버 상태 확인을 위해 MySQL 연결이 살아 있는지 검사합니다.
export async function pingDatabase() {
  await pool.query("SELECT 1");
}
