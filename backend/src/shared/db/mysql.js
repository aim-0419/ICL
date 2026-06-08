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
  timezone: "+09:00",
});

let initPromise = null;

// 테이블 역할 설명은 DB 관리 도구에서 바로 확인할 수 있도록 MySQL TABLE COMMENT로 반영합니다.
const SCHEMA_TABLE_COMMENTS = {
  // ── 회원·인증 ───────────────────────────────────────────────────────────────
  users: "회원 정보(이름·이메일·비밀번호·등급·포인트)를 보관합니다. 개인정보는 암호화해서 저장합니다.",
  sessions: "로그인 상태를 유지하기 위한 인증 토큰을 보관합니다. 만료되면 자동 삭제됩니다.",
  email_verifications: "회원가입·비밀번호 찾기 시 발송한 이메일 인증번호와 유효 여부를 보관합니다.",
  login_rate_limits: "같은 IP에서 로그인을 여러 번 실패하면 일정 시간 차단하기 위한 기록입니다.",
  signup_rate_limits: "같은 IP에서 회원가입을 짧은 시간에 너무 많이 시도하지 못하도록 막는 기록입니다.",

  // ── 상품·결제·주문 ─────────────────────────────────────────────────────────
  products: "판매 중인 강의 상품의 이름·가격·수강 기간을 보관합니다.",
  cart_items: "회원이 장바구니에 담아 둔 상품 목록을 보관합니다.",
  orders: "결제가 완료된 주문 내역(상품·금액·구매자)을 보관합니다.",
  payment_confirmations: "결제 시스템(포트원)에서 결제 완료를 확인한 기록입니다. 금액 위변조 방지에 사용합니다.",
  payment_webhook_events: "결제 시스템(포트원)이 보내온 자동 알림(웹훅)의 수신·처리 이력을 보관합니다.",
  refund_requests: "회원이 신청한 환불 요청과 관리자의 처리 결과(승인·거절)를 보관합니다.",
  point_history: "회원 포인트가 적립되거나 차감될 때마다 그 이유와 금액을 기록합니다.",

  // ── 강의 아카데미 ───────────────────────────────────────────────────────────
  academy_videos: "온라인 강의의 제목·강사·가격·썸네일 등 기본 정보를 보관합니다.",
  academy_video_chapters: "강의를 구성하는 차시별 영상 파일과 재생 시간을 보관합니다.",
  academy_progress: "회원별로 각 강의를 얼마나 들었는지(진도율·완강 여부)를 기록합니다.",
  academy_chapter_progress: "회원별로 각 차시를 얼마나 들었는지(진도율·이어보기 위치)를 기록합니다.",
  academy_playback_sessions: "강의 영상을 한 계정으로 여러 기기에서 동시에 재생하지 못하도록 관리합니다.",
  academy_reviews: "강의 수강 후 회원이 남긴 별점과 후기를 보관합니다.",
  academy_qna_posts: "강의 수강 중 회원이 남긴 질문을 보관합니다.",
  academy_qna_replies: "강의 Q&A 질문에 달린 답변을 보관합니다.",
  academy_certificates: "강의를 완강한 회원에게 발급된 수료증 정보를 보관합니다.",
  video_grants: "관리자가 특정 회원에게 강의를 무료로 선물했을 때 그 권한 내역을 보관합니다.",

  // ── 스튜디오 운영 ───────────────────────────────────────────────────────────
  studio_classes: "필라테스 수업 일정(날짜·시간·강사·정원·반복 여부)을 보관합니다.",
  studio_passes: "회원이 보유한 수강권(종류·잔여 횟수·만료일·상태)을 보관합니다.",
  studio_bookings: "회원의 수업 예약 내역과 상태(예약 완료·대기·취소)를 보관합니다.",
  studio_pass_transactions: "수강권 횟수가 늘거나 줄 때마다 그 이유와 변동량을 기록합니다.",
  studio_checkins: "수업 당일 관리자가 처리한 회원 체크인 기록을 보관합니다.",
  studio_arrears: "회원의 미수금(아직 결제하지 않은 금액) 내역과 정리 여부를 보관합니다.",
  studio_business_hours: "스튜디오 요일별 영업 시작·종료 시간을 보관합니다.",
  studio_holidays: "스튜디오 휴무일을 보관합니다. 등록된 날은 예약이 불가능합니다.",
  studio_booking_policies: "예약 마감 시간, 취소 마감 시간, 당일 변경 허용 여부 등 운영 정책을 보관합니다.",
  studio_lockers: "스튜디오에 등록된 락커 번호·위치·상태(사용 가능·점검 중·사용 중)를 보관합니다.",
  studio_locker_assignments: "회원에게 배정된 락커와 이용 기간을 보관합니다.",
  studio_notifications: "회원에게 발송하거나 예약해 둔 알림(제목·내용·발송 상태)을 보관합니다.",
  studio_notification_logs: "알림이 실제로 발송된 이력을 기록합니다. (발송 성공·실패 추적용)",
  studio_instructor_hours: "강사별 요일별 근무 가능 시간을 보관합니다.",
  studio_role_permissions: "직책(오너·매니저·강사)별로 어떤 기능을 쓸 수 있는지 권한을 보관합니다.",
  studio_staff_profiles: "스튜디오 운영자가 관리하는 강사·매니저 프로필과 앱연결, 권한, 급여 기준을 보관합니다.",
  studio_member_memos: "관리자가 특정 회원에 대해 남긴 내부 메모를 보관합니다.",
  studio_class_recurrences: "반복 수업으로 묶인 수업들의 그룹 정보를 보관합니다. (반복 수업 일괄 관리용)",
  studio_pass_pauses: "수강권 일시정지 처리 이력을 보관합니다. (언제 누가 정지했는지 추적용)",
  studio_pass_transfers: "수강권 양도 처리 이력을 보관합니다. (누구에게 넘겼는지 추적용)",
  studio_pass_refunds: "수강권 환불 요청과 관리자의 처리 결과(승인·거절)를 보관합니다.",

  // ── 커뮤니티 ───────────────────────────────────────────────────────────────
  review_posts: "커뮤니티 후기 게시판의 글을 보관합니다.",
  review_comments: "후기 게시글에 달린 댓글을 보관합니다.",
  events: "센터 이벤트·프로모션 공지글을 보관합니다.",
  inquiry_posts: "회원이 남긴 1:1 문의 글을 보관합니다. 비밀글 설정도 지원합니다.",
  inquiry_replies: "1:1 문의에 달린 관리자 답변을 보관합니다.",

  // ── 브랜드·콘텐츠 ──────────────────────────────────────────────────────────
  instructors: "홈페이지 강사 소개 페이지에 표시할 강사 프로필을 보관합니다.",
  branches: "홈페이지 지점 안내 페이지에 표시할 지점 정보(주소·연락처·지도)를 보관합니다.",
  social_feed_cache: "유튜브·블로그·인스타그램 최신 게시물을 홈페이지에 빠르게 보여주기 위한 임시 저장소입니다.",
  admin_page_overrides: "관리자가 홈페이지 편집 모드에서 바꾼 이미지·문구·위치 설정을 보관합니다.",
};

// 테이블 컬럼별 용도 설명 (Workbench에서 해당 컬럼에 마우스를 올리면 표시됩니다)
const SCHEMA_COLUMN_COMMENTS = {
  users: {
    id: "회원 한 명에게 부여되는 고유 번호",
    login_id: "로그인할 때 입력하는 아이디",
    name: "화면에 표시되는 회원 이름 (암호화 저장)",
    email: "이메일 인증과 알림 발송에 사용하는 이메일 주소 (암호화 저장)",
    password: "비밀번호 (해킹에 대비해 암호화된 형태로 저장)",
    phone: "연락처 휴대폰 번호 (암호화 저장)",
    role: "회원 역할 구분 (user=일반, admin=관리자)",
    is_admin: "관리자 여부 (1=관리자, 0=일반 회원)",
    user_grade: "회원 등급 (member=일반, vip, vvip, admin0, admin1)",
    birth_year_encrypted: "연령대 통계 분석을 위해 암호화 저장한 출생연도",
    points: "현재 보유 포인트 잔액",
    account_status: "계정 상태 (active=정상, withdrawn=탈퇴)",
    withdrawn_at: "탈퇴 처리된 날짜와 시간",
    withdrawal_purge_at: "개인정보 보호법에 따라 데이터를 완전 삭제할 예정 날짜",
    restored_at: "탈퇴 후 계정을 복구한 날짜와 시간",
    marketing_agree: "마케팅 정보 수신 동의 여부 (1=동의, 0=미동의)",
    marketing_agreed_at: "마케팅 수신에 동의한 날짜와 시간",
    created_at: "회원 가입 날짜와 시간",
  },
  sessions: {
    token: "로그인 상태를 유지하기 위해 발급된 인증 토큰",
    user_id: "이 토큰을 가진 회원 번호",
    created_at: "토큰이 발급된 날짜와 시간",
  },
  products: {
    id: "상품 고유 번호",
    name: "결제창과 목록에 표시되는 상품 이름",
    price: "판매 가격 (원)",
    description: "상품 상세 설명",
    period: "수강 가능 기간 (예: 30일, 무제한 수강)",
  },
  academy_videos: {
    id: "강의 고유 번호",
    product_id: "이 강의와 연결된 결제 상품 번호",
    instructor: "담당 강사 이름",
    category: "강의 분류 (입문, 초급, 중급, 고급 등)",
    badge: "강의 카드에 표시되는 강조 배지 문구 (예: NEW, BEST)",
    original_price: "정가 (할인 전 가격)",
    sale_price: "실제 판매 가격",
    rating: "수강생들이 남긴 평균 별점",
    reviews: "수강평 개수",
    image_path: "강의 대표 이미지 파일 경로",
    video_path: "강의 기본 영상 파일 경로",
    publish_at: "강의가 수강생에게 공개되는 날짜와 시간",
    is_hidden: "강의 목록에서 숨김 처리 여부 (1=숨김, 0=공개)",
    created_at: "강의가 등록된 날짜와 시간",
  },
  academy_progress: {
    user_id: "진도 기록의 주인인 회원 번호",
    video_id: "진도를 기록 중인 강의 번호",
    current_time: "마지막으로 시청한 위치 (초 단위, 이어보기에 사용)",
    duration: "강의 전체 길이 (초 단위)",
    progress_percent: "현재까지 들은 진도율 (%)",
    completed: "완강 여부 (1=완강, 0=미완강)",
    last_watched_at: "마지막으로 강의를 본 날짜와 시간",
    created_at: "처음 강의를 시작한 날짜와 시간",
  },
  academy_video_chapters: {
    id: "차시 고유 번호",
    video_id: "이 차시가 속한 강의 번호",
    chapter_order: "강의 내 차시 순서 번호 (1부터 시작)",
    title: "차시 제목",
    description: "차시 설명",
    video_path: "차시 영상 파일 경로",
    duration_sec: "차시 영상 길이 (초 단위)",
    is_preview: "비구매자도 무료로 미리볼 수 있는지 여부 (1=가능, 0=불가)",
    created_at: "차시가 등록된 날짜와 시간",
  },
  academy_chapter_progress: {
    user_id: "차시 진도 기록의 주인인 회원 번호",
    video_id: "이 차시가 속한 강의 번호",
    chapter_id: "진도를 기록 중인 차시 번호",
    current_time: "마지막으로 시청한 위치 (초 단위, 이어보기에 사용)",
    duration: "차시 전체 길이 (초 단위)",
    progress_percent: "현재까지 들은 진도율 (%)",
    completed: "차시 완료 여부 (1=완료, 0=미완료)",
    last_watched_at: "마지막으로 차시를 본 날짜와 시간",
    created_at: "처음 차시를 시작한 날짜와 시간",
  },
  academy_playback_sessions: {
    id: "재생 세션 고유 번호",
    user_id: "영상을 재생 중인 회원 번호",
    video_id: "재생 중인 강의 번호",
    chapter_id: "재생 중인 차시 번호",
    session_key: "한 기기에서만 재생 중임을 확인하는 인증 키",
    status: "재생 세션 상태 (active=재생 중, expired=만료, revoked=강제 종료)",
    ip_address: "영상을 재생 중인 기기의 인터넷 주소",
    user_agent: "영상을 재생 중인 기기·브라우저 정보",
    created_at: "재생 세션이 시작된 날짜와 시간",
    last_seen_at: "마지막으로 재생 중임을 확인한 시간 (30초마다 갱신)",
    expires_at: "재생 세션이 자동으로 만료되는 날짜와 시간",
    revoked_at: "재생 세션이 강제로 종료된 날짜와 시간",
    revoke_reason: "강제 종료 사유 (예: 다른 기기에서 재생 시작)",
  },
  cart_items: {
    user_id: "장바구니 주인인 회원 번호",
    product_id: "장바구니에 담긴 상품 번호",
    quantity: "장바구니에 담은 수량",
    updated_at: "장바구니가 마지막으로 변경된 날짜와 시간",
  },
  orders: {
    id: "주문 고유 번호",
    order_name: "결제창과 관리자 화면에 표시되는 주문 이름",
    amount: "실제 결제된 금액 (원)",
    customer_email: "주문자 이메일 (암호화 저장)",
    payload: "주문한 상품 상세 정보 (JSON 형식으로 저장)",
    created_at: "주문이 생성된 날짜와 시간",
  },
  social_feed_cache: {
    source: "소셜 채널 구분 (youtube, blog, instagram 등)",
    label: "화면에 표시할 소셜 채널 이름",
    title: "게시물 제목",
    url: "원본 게시물 링크 주소",
    published_at: "원본 게시물이 올라간 날짜와 시간",
    excerpt: "게시물 미리보기 내용",
    thumbnail: "게시물 대표 이미지 주소",
    is_live: "현재 라이브 방송 중인지 여부 (1=라이브, 0=일반)",
    updated_at: "이 캐시가 마지막으로 새로고침된 날짜와 시간",
  },
  review_posts: {
    id: "후기 글 고유 번호",
    title: "후기 글 제목",
    content: "후기 글 본문",
    author: "작성자 이름",
    author_id: "작성자 회원 번호",
    date: "게시판에 표시되는 작성 날짜",
    views: "글 조회수",
    created_at: "글이 작성된 날짜와 시간",
  },
  review_comments: {
    id: "댓글 고유 번호",
    review_id: "댓글이 달린 후기 글 번호",
    author: "댓글 작성자 이름",
    content: "댓글 내용",
    created_at: "댓글이 작성된 날짜와 시간",
  },
  events: {
    id: "이벤트 글 고유 번호",
    title: "이벤트 제목",
    status: "이벤트 진행 상태 (진행중, 종료 등)",
    start_date: "이벤트 시작일",
    end_date: "이벤트 종료일",
    likes: "좋아요 수",
    image: "이벤트 대표 이미지 파일 경로",
    summary: "이벤트 요약 설명",
  },
  inquiry_posts: {
    id: "문의 글 고유 번호",
    title: "문의 글 제목",
    content: "문의 글 본문",
    author: "문의 작성자 이름",
    author_id: "문의 작성자 회원 번호",
    date: "게시판에 표시되는 작성 날짜",
    views: "글 조회수",
    is_secret: "비밀글 여부 (1=비밀글, 0=공개)",
    created_at: "문의가 작성된 날짜와 시간",
  },
  inquiry_replies: {
    id: "답변 고유 번호",
    inquiry_id: "이 답변이 달린 문의 글 번호",
    author_id: "답변 작성자(관리자) 회원 번호",
    author_name: "답변 작성자 이름",
    content: "답변 내용",
    created_at: "답변이 작성된 날짜와 시간",
  },
  point_history: {
    id: "포인트 이력 고유 번호",
    user_id: "포인트 변동이 발생한 회원 번호",
    amount: "포인트 변동량 (양수=적립, 음수=사용)",
    reason: "포인트 변동 사유 (예: 강의 구매 적립, 포인트 사용)",
    order_id: "포인트 변동과 연결된 주문 번호",
    created_at: "포인트 변동이 발생한 날짜와 시간",
  },
  admin_page_overrides: {
    id: "편집 이력 고유 번호",
    override_type: "편집 종류 (image=이미지, text=문구, position=위치 등)",
    override_key: "편집 대상 요소를 구분하는 키",
    override_value: "저장된 편집 내용 (JSON 형식)",
    updated_at: "마지막으로 편집한 날짜와 시간",
  },
  instructors: {
    id: "강사 고유 번호",
    name: "강사 이름",
    role: "직책 또는 타이틀 (예: 원장, 강사)",
    intro: "강사 소개 내용",
    careers: "강사 경력 목록",
    image_path: "강사 프로필 사진 파일 경로",
    sort_order: "강사 목록에서 표시되는 순서",
    created_at: "강사 정보가 등록된 날짜와 시간",
  },
  branches: {
    id: "지점 고유 번호",
    name: "지점 이름",
    address: "지점 주소",
    phone: "지점 대표 전화번호",
    parking: "주차 안내 설명",
    lat: "지도 표시를 위한 위도 좌표",
    lng: "지도 표시를 위한 경도 좌표",
    map_link: "카카오맵·네이버지도 등 외부 지도 링크",
    sort_order: "지점 목록에서 표시되는 순서",
    created_at: "지점 정보가 등록된 날짜와 시간",
  },
  academy_reviews: {
    id: "수강평 고유 번호",
    video_id: "수강평이 달린 강의 번호",
    user_id: "수강평을 작성한 회원 번호",
    user_name: "수강평 작성자 이름",
    rating: "별점 (1~5)",
    content: "수강평 내용",
    created_at: "수강평이 작성된 날짜와 시간",
  },
  academy_qna_posts: {
    id: "Q&A 질문 고유 번호",
    video_id: "질문이 달린 강의 번호",
    user_id: "질문을 작성한 회원 번호",
    user_name: "질문 작성자 이름",
    title: "질문 제목",
    content: "질문 내용",
    is_secret: "비밀 질문 여부 (1=비밀, 0=공개)",
    created_at: "질문이 작성된 날짜와 시간",
  },
  academy_qna_replies: {
    id: "Q&A 답변 고유 번호",
    post_id: "이 답변이 달린 질문 번호",
    user_id: "답변 작성자 회원 번호",
    user_name: "답변 작성자 이름",
    content: "답변 내용",
    is_admin: "관리자가 작성한 공식 답변인지 여부 (1=공식, 0=일반)",
    created_at: "답변이 작성된 날짜와 시간",
  },
};

// 이후 추가된 컬럼 또는 스튜디오 테이블 컬럼 설명
const EXTRA_SCHEMA_COLUMN_COMMENTS = {
  users: {
    email_hash: "이메일을 복호화하지 않고 빠르게 조회하기 위한 검색용 값 (개인정보 보호 목적)",
    phone_hash: "전화번호를 복호화하지 않고 빠르게 조회하기 위한 검색용 값 (개인정보 보호 목적)",
    name_hash: "이름을 복호화하지 않고 빠르게 조회하기 위한 검색용 값 (아이디 찾기 등에 사용)",
    birth_year_encrypted: "연령대 통계 분석을 위해 암호화 저장한 출생연도",
  },
  sessions: {
    expires_at: "이 로그인 토큰이 자동으로 만료되는 날짜와 시간",
  },
  email_verifications: {
    email: "인증번호를 발송한 이메일 주소 (암호화 저장)",
    email_hash: "이메일을 복호화하지 않고 빠르게 조회하기 위한 검색용 값",
    code: "이메일로 발송된 6자리 인증번호",
    expires_at: "인증번호가 만료되는 날짜와 시간 (보통 10분)",
    verified_at: "인증이 성공적으로 완료된 날짜와 시간",
    attempts: "인증번호를 틀린 횟수 (5회 초과 시 차단)",
    send_count: "같은 이메일로 인증번호를 발송한 횟수",
    first_sent_at: "처음 인증번호를 발송한 날짜와 시간 (발송 횟수 제한 기준)",
  },
  orders: {
    customer_email_hash: "주문자 이메일을 복호화하지 않고 주문 조회를 위한 검색용 값",
    cancelled_product_ids: "환불 처리로 수강 권한이 취소된 강의 번호 목록",
  },
  payment_confirmations: {
    order_id: "결제 확인 대상 주문 번호",
    payment_id: "결제 시스템(포트원)에서 부여한 결제 고유 번호",
    user_id: "결제를 요청한 회원 번호",
    customer_email: "결제자 이메일 (암호화 저장)",
    customer_email_hash: "결제자 이메일 조회용 검색 값",
    amount: "결제 시스템에서 확인된 실제 결제 금액 (원)",
    status: "결제 처리 단계 (confirmed=확인 완료, consumed=수강권 반영 완료)",
    payment_payload: "결제 시스템(포트원)에서 받은 결제 상세 원본 데이터",
    confirmed_at: "결제 금액 위변조 검증이 완료된 날짜와 시간",
    consumed_at: "결제 완료 후 수강권·강의 권한이 실제로 부여된 날짜와 시간",
    order_created_at: "이 결제와 연결된 주문이 생성된 날짜와 시간",
  },
  payment_webhook_events: {
    webhook_id: "결제 시스템(포트원)이 보내온 알림 고유 번호",
    event_type: "알림 종류 (예: 결제 완료, 결제 취소)",
    payment_id: "이 알림과 연결된 결제 고유 번호",
    payload: "결제 시스템이 보내온 알림 원본 내용",
    process_status: "알림 처리 결과 (처리 완료, 처리 실패 등)",
    process_message: "알림 처리 중 발생한 메시지 또는 오류 내용",
    received_at: "알림을 처음 받은 날짜와 시간",
    processed_at: "알림 처리가 완료된 날짜와 시간",
    last_seen_at: "같은 알림을 마지막으로 받은 날짜와 시간 (중복 수신 감지용)",
    attempts: "같은 알림을 받은 총 횟수",
  },
  review_posts: {
    image_url: "후기 글에 첨부된 이미지 파일 경로",
    video_url: "후기 글에 첨부된 영상 파일 경로",
  },
  events: {
    content: "이벤트 상세 내용",
    created_at: "이벤트 글이 등록된 날짜와 시간",
  },
  inquiry_posts: {
    image_url: "문의 글에 첨부된 이미지 파일 경로",
    video_url: "문의 글에 첨부된 영상 파일 경로",
  },
  refund_requests: {
    id: "환불 신청 고유 번호",
    order_id: "환불을 신청한 주문 번호",
    user_id: "환불을 신청한 회원 번호",
    customer_email: "환불 신청자 이메일 (암호화 저장)",
    customer_email_hash: "환불 신청자 이메일 조회용 검색 값",
    selected_product_ids: "환불을 신청한 강의 번호 목록 (여러 개일 경우 모두 포함)",
    requested_amount: "회원이 요청한 환불 금액 (원)",
    reason: "회원이 입력한 환불 사유",
    status: "환불 처리 상태 (pending=검토 중, approved=완료, rejected=거절)",
    admin_note: "관리자가 남긴 처리 메모 (회원에게도 표시됨)",
    created_at: "환불을 신청한 날짜와 시간",
    resolved_at: "환불 승인 또는 거절이 처리된 날짜와 시간",
  },
  video_grants: {
    id: "강의 선물 고유 번호",
    user_id: "강의를 선물받은 회원 번호",
    video_id: "선물한 강의 번호",
    granted_by: "강의를 선물한 관리자 회원 번호",
    duration_type: "수강 권한 유효 기간 종류 (예: 30일, 무제한)",
    expires_at: "수강 권한이 만료되는 날짜와 시간 (무제한이면 비워둠)",
    created_at: "강의를 선물한 날짜와 시간",
  },
  login_rate_limits: {
    ip: "로그인 실패를 기록 중인 접속 IP 주소",
    fail_count: "현재까지 로그인에 실패한 횟수",
    blocked_until: "로그인 차단이 풀리는 날짜와 시간",
    updated_at: "이 기록이 마지막으로 갱신된 날짜와 시간",
  },
  signup_rate_limits: {
    ip: "회원가입 시도를 기록 중인 접속 IP 주소",
    attempt_count: "일정 시간 안에 회원가입을 시도한 횟수",
    window_start: "시도 횟수 제한을 시작한 날짜와 시간",
    updated_at: "이 기록이 마지막으로 갱신된 날짜와 시간",
  },

  // ── 스튜디오 테이블 컬럼 설명 ──────────────────────────────────────────────
  studio_classes: {
    id: "수업 고유 번호",
    class_type: "수업 유형 (private=개인, group=그룹, consulting=상담, etc=기타)",
    title: "수업 이름 (예: 그룹 리포머, 개인 레슨)",
    instructor_name: "담당 강사 이름",
    room_name: "진행 공간 또는 수업 종류 (예: 개인, 듀엣, 그룹)",
    start_at: "수업 시작 날짜와 시간",
    end_at: "수업 종료 날짜와 시간",
    capacity: "수업 최대 정원 수",
    reserved_count: "현재 예약 확정된 인원 수",
    waitlist_count: "현재 대기 중인 인원 수",
    status: "수업 상태 (active=운영 중, cancelled=폐강, deleted=삭제)",
    repeat_group_id: "반복 수업으로 묶인 그룹 번호 (반복 수업이면 같은 값을 공유)",
    created_by: "수업을 등록한 관리자 회원 번호",
    created_at: "수업이 등록된 날짜와 시간",
  },
  studio_passes: {
    id: "수강권 고유 번호",
    user_id: "이 수강권을 보유한 회원 번호",
    pass_name: "수강권 이름 (예: 그룹 20회권, 개인 10회권)",
    pass_type: "수강권 종류 (personal=개인, duet=듀엣, group=그룹)",
    remaining_count: "현재 사용 가능한 잔여 횟수",
    total_count: "처음 발급 시 총 횟수",
    expires_at: "수강권 만료 날짜와 시간 (없으면 무기한)",
    status: "수강권 상태 (active=사용 중, paused=정지, transferred=양도됨, refunded=환불됨)",
    created_at: "수강권이 발급된 날짜와 시간",
    updated_at: "수강권 정보가 마지막으로 변경된 날짜와 시간",
  },
  studio_bookings: {
    id: "예약 고유 번호",
    class_id: "예약한 수업 번호",
    user_id: "예약한 회원 번호",
    pass_id: "예약 시 사용된 수강권 번호",
    status: "예약 상태 (reserved=예약 완료, waitlisted=대기 중, cancelled=취소)",
    booked_at: "예약이 접수된 날짜와 시간",
  },
  studio_pass_transactions: {
    id: "수강권 이용 내역 고유 번호",
    pass_id: "내역이 발생한 수강권 번호",
    user_id: "수강권 보유 회원 번호",
    class_id: "관련 수업 번호 (수업과 연관된 내역일 경우)",
    delta_count: "횟수 변동량 (음수=차감, 양수=복구)",
    reason: "변동 사유 (예: 예약 확정, 예약 취소, 수업 폐강)",
    created_at: "이 내역이 발생한 날짜와 시간",
  },
  studio_checkins: {
    id: "체크인 기록 고유 번호",
    class_id: "체크인한 수업 번호",
    user_id: "체크인한 회원 번호",
    booking_id: "체크인과 연결된 예약 번호",
    status: "체크인 상태 (checked_in=출석 완료)",
    checked_in_at: "체크인이 처리된 날짜와 시간",
    checked_in_by: "체크인을 처리한 관리자 회원 번호",
  },
  studio_arrears: {
    id: "미수금 기록 고유 번호",
    user_id: "미수금이 발생한 회원 번호",
    amount: "미수금 금액 (원)",
    reason: "미수금 발생 사유",
    status: "처리 상태 (open=미처리, resolved=정리 완료)",
    created_at: "미수금이 등록된 날짜와 시간",
    resolved_at: "미수금이 정리된 날짜와 시간",
  },
  studio_business_hours: {
    id: "영업시간 설정 고유 번호",
    weekday: "요일 번호 (0=일요일, 1=월요일 ... 6=토요일)",
    open_time: "영업 시작 시간 (예: 09:00:00)",
    close_time: "영업 종료 시간 (예: 21:00:00)",
    is_closed: "해당 요일 휴무 여부 (1=휴무, 0=영업)",
  },
  studio_holidays: {
    id: "휴무일 고유 번호",
    holiday_date: "휴무일 날짜 (이 날은 예약 불가)",
    description: "휴무 사유 (예: 명절, 시설 점검)",
    created_at: "휴무일이 등록된 날짜와 시간",
  },
  studio_booking_policies: {
    id: "예약 정책 고유 번호",
    booking_limit_hours: "수업 시작 몇 시간 전까지 예약 가능한지 (예: 2=2시간 전까지)",
    cancel_limit_hours: "수업 시작 몇 시간 전까지 취소 가능한지 (예: 2=2시간 전까지)",
    same_day_change_allowed: "당일 예약 변경 허용 여부 (1=허용, 0=불가)",
    updated_at: "정책이 마지막으로 수정된 날짜와 시간",
  },
  studio_lockers: {
    id: "락커 고유 번호",
    locker_no: "락커 번호 (예: A-01, B-03)",
    location: "락커 위치 설명 (예: 여성 탈의실 1번 줄)",
    status: "락커 상태 (available=사용 가능, occupied=사용 중, maintenance=점검 중)",
    created_at: "락커가 등록된 날짜와 시간",
  },
  studio_locker_assignments: {
    id: "락커 배정 고유 번호",
    locker_id: "배정된 락커 번호",
    user_id: "락커를 배정받은 회원 번호",
    start_date: "락커 이용 시작일",
    end_date: "락커 이용 종료일 (없으면 무기한)",
    status: "배정 상태 (active=이용 중, ended=종료)",
    created_at: "배정이 처리된 날짜와 시간",
  },
  studio_notifications: {
    id: "알림 고유 번호",
    user_id: "알림을 받을 회원 번호",
    type: "알림 종류 (manual=직접 발송, auto=자동 발송)",
    title: "알림 제목",
    message: "알림 내용",
    status: "발송 상태 (pending=대기, sent=발송 완료, failed=실패)",
    scheduled_at: "예약 발송 날짜와 시간 (즉시 발송이면 비워둠)",
    sent_at: "실제 발송된 날짜와 시간",
    created_at: "알림이 등록된 날짜와 시간",
  },
  studio_instructor_hours: {
    id: "강사 근무시간 고유 번호",
    instructor_name: "강사 이름",
    weekday: "근무 요일 번호 (0=일요일, 1=월요일 ... 6=토요일)",
    start_time: "근무 시작 시간",
    end_time: "근무 종료 시간",
    is_off: "해당 요일 휴무 여부 (1=휴무, 0=근무)",
  },
  studio_role_permissions: {
    id: "권한 설정 고유 번호",
    role_code: "직책 코드 (owner=오너, manager=매니저, instructor=강사)",
    permission_code: "기능 권한 코드 (예: class.write=수업 등록, member.read=회원 조회)",
    is_allowed: "해당 권한 허용 여부 (1=허용, 0=차단)",
  },
  studio_staff_profiles: {
    id: "강사/스태프 고유 번호",
    name: "강사 또는 스태프 이름",
    role_code: "역할 코드 (owner=오너, manager=매니저, instructor=강사)",
    employment_type: "근무형태 (full_time=정규, part_time=파트타임, freelance=프리랜서)",
    phone: "휴대폰 번호",
    app_connection_status: "앱 연결 상태 (connected=연결, not_connected=미연결)",
    color: "목록과 캘린더에서 구분할 색상",
    status: "재직 상태 (active=재직, inactive=휴직/비활성, archived=삭제)",
    can_manage_schedule: "일정 관리 권한",
    can_view_members: "회원 조회 권한",
    can_manage_passes: "수강권 관리 권한",
    can_view_sales: "매출 조회 권한",
    salary_type: "급여 기준 (fixed=고정급, hourly=시급, commission=수업/매출 비율)",
    base_pay: "고정급 금액",
    hourly_wage: "시급 금액",
    commission_rate: "수업/매출 비율",
    memo: "운영자가 남기는 강사 특이사항",
    created_at: "프로필이 생성된 날짜와 시간",
    updated_at: "프로필을 마지막으로 수정한 날짜와 시간",
  },
  studio_member_memos: {
    id: "메모 고유 번호",
    user_id: "메모 대상 회원 번호",
    memo: "관리자가 남긴 내부 메모 내용",
    created_by: "메모를 작성한 관리자 회원 번호",
    created_at: "메모가 작성된 날짜와 시간",
  },
  studio_pass_refunds: {
    id: "수강권 환불 신청 고유 번호",
    pass_id: "환불을 신청한 수강권 번호",
    user_id: "환불을 신청한 회원 번호",
    refund_amount: "환불 신청 금액 (원)",
    reason: "환불 신청 사유",
    status: "처리 상태 (requested=검토 중, approved=승인 완료, rejected=거절)",
    requested_at: "환불을 신청한 날짜와 시간",
    resolved_at: "환불 승인 또는 거절이 처리된 날짜와 시간",
  },
  studio_pass_pauses: {
    id: "정지 이력 고유 번호",
    pass_id: "정지된 수강권 번호",
    reason: "정지 사유",
    created_at: "정지가 처리된 날짜와 시간",
  },
  studio_pass_transfers: {
    id: "양도 이력 고유 번호",
    pass_id: "양도된 수강권 번호",
    from_user_id: "수강권을 넘긴 회원 번호",
    to_user_id: "수강권을 받은 회원 번호",
    transfer_count: "양도된 횟수",
    reason: "양도 사유",
    created_at: "양도가 처리된 날짜와 시간",
  },
  studio_class_recurrences: {
    id: "반복 수업 그룹 고유 번호",
    repeat_group_id: "같은 반복 수업으로 묶인 그룹 번호",
    class_id: "이 그룹에 속한 수업 번호",
    created_at: "등록된 날짜와 시간",
  },
  studio_notification_logs: {
    id: "발송 이력 고유 번호",
    notification_id: "발송된 알림 번호",
    channel: "발송 채널 (예: sms, push, email)",
    status: "발송 결과 (sent=성공, failed=실패)",
    sent_at: "실제 발송된 날짜와 시간",
  },
  academy_certificates: {
    id: "수료증 고유 번호",
    user_id: "수료증을 받은 회원 번호",
    video_id: "수료한 강의 번호",
    certificate_no: "수료증 고유 인증 번호",
    issued_at: "수료증이 발급된 날짜와 시간",
    created_at: "수료증 정보가 생성된 날짜와 시간",
    revoked_at: "수료증이 취소된 날짜와 시간 (정상 발급이면 비워둠)",
  },
};

SCHEMA_TABLE_COMMENTS.studio_member_profiles =
  "필라테스 운영에 필요한 회원 상세 정보를 보관합니다. 로그인 계정(users)과 분리해 성별, 생년월일, 주소, 앱 연결 여부, 담당강사 같은 센터 운영 정보를 관리합니다.";
SCHEMA_TABLE_COMMENTS.studio_pass_payments =
  "필라테스 수강권별 결제 정보를 보관합니다. 한 회원이 여러 수강권을 결제할 수 있으므로 수강권(studio_passes)과 연결해 결제구분, 금액, 결제일, 결제방법, 할부개월수를 관리합니다.";

EXTRA_SCHEMA_COLUMN_COMMENTS.studio_member_profiles = {
  user_id: "회원 로그인 계정(users.id)과 연결되는 값입니다. 한 회원당 스튜디오 운영 프로필은 하나만 가집니다.",
  app_connection_status: "스튜디오 앱 연결 상태입니다. connected=연결, not_connected=미연결입니다.",
  member_status: "스튜디오 회원관리 상태입니다. active=관리 대상, inactive=수강권 없음/휴면, expired=수강권 만료, archived=관리 제외입니다.",
  gender: "회원 성별입니다. 운영 상담과 통계 확인에 사용합니다.",
  birth_date: "회원 생년월일입니다. 생일 안내나 연령대 확인에 사용합니다.",
  address: "회원 기본 주소입니다.",
  address_detail: "동, 호수 등 상세 주소입니다.",
  primary_instructor: "회원의 주 담당강사 이름입니다.",
  registered_at: "스튜디오 회원으로 처음 등록된 날짜입니다. 없으면 통합회원 가입일을 참고합니다.",
  created_at: "스튜디오 운영 프로필이 생성된 날짜와 시간입니다.",
  updated_at: "스튜디오 운영 프로필이 마지막으로 수정된 날짜와 시간입니다.",
};

EXTRA_SCHEMA_COLUMN_COMMENTS.studio_passes = {
  ...(EXTRA_SCHEMA_COLUMN_COMMENTS.studio_passes || {}),
  is_family_pass: "패밀리 수강권 여부입니다. 1이면 가족과 함께 쓰는 수강권, 0이면 개인 수강권입니다.",
  reservable_count: "현재 예약 가능한 횟수입니다. 보통 잔여횟수와 같지만 운영 정책에 따라 다르게 관리할 수 있습니다.",
  cancellable_count: "현재 취소 가능한 횟수입니다. 취소 제한 정책이 있을 때 별도로 관리합니다.",
};

EXTRA_SCHEMA_COLUMN_COMMENTS.studio_pass_payments = {
  id: "수강권 결제 기록의 고유 번호입니다.",
  pass_id: "결제된 수강권(studio_passes.id)과 연결되는 값입니다.",
  user_id: "결제한 회원(users.id)과 연결되는 값입니다.",
  payment_type: "결제구분입니다. 신규결제, 재결제, 환불, 조정처럼 운영자가 구분해서 기록합니다.",
  amount: "수강권 결제금액입니다.",
  paid_at: "결제가 이루어진 날짜와 시간입니다.",
  payment_method: "결제방법입니다. 카드, 계좌이체, 현금 등으로 기록합니다.",
  installment_months: "카드 할부개월수입니다. 일시불이면 0 또는 1로 기록할 수 있습니다.",
  note: "결제와 관련해 관리자가 남기는 참고 메모입니다.",
  created_at: "결제 기록이 생성된 날짜와 시간입니다.",
  updated_at: "결제 기록이 마지막으로 수정된 날짜와 시간입니다.",
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
    CREATE TABLE IF NOT EXISTS academy_certificates (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      video_id VARCHAR(80) NOT NULL,
      certificate_no VARCHAR(80) NOT NULL,
      issued_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      UNIQUE KEY ux_academy_certificates_user_video (user_id, video_id),
      UNIQUE KEY ux_academy_certificates_no (certificate_no),
      INDEX idx_academy_certificates_user (user_id, issued_at),
      INDEX idx_academy_certificates_video (video_id),
      CONSTRAINT fk_academy_certificates_users
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_academy_certificates_videos
        FOREIGN KEY (video_id) REFERENCES academy_videos(id)
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_classes (
      id VARCHAR(80) PRIMARY KEY,
      class_type ENUM('private','group','consulting','etc') NOT NULL DEFAULT 'group',
      title VARCHAR(160) NOT NULL,
      instructor_name VARCHAR(120) NOT NULL,
      room_name VARCHAR(120) NOT NULL,
      start_at DATETIME NOT NULL,
      end_at DATETIME NOT NULL,
      capacity INT NOT NULL DEFAULT 1,
      status ENUM('active','cancelled','deleted') NOT NULL DEFAULT 'active',
      repeat_group_id VARCHAR(80) NULL,
      created_by VARCHAR(64) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_studio_classes_start (start_at),
      INDEX idx_studio_classes_status (status)
    )
  `);
  await pool.query(`ALTER TABLE studio_classes MODIFY status ENUM('active','cancelled','deleted') NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE studio_classes ADD COLUMN class_type ENUM('private','group','consulting','etc') NOT NULL DEFAULT 'group'`).catch((e) => { if (e.errno !== 1060) throw e; });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_member_profiles (
      user_id VARCHAR(64) PRIMARY KEY COMMENT '회원 로그인 계정(users.id)과 연결되는 값입니다. 한 회원당 스튜디오 운영 프로필은 하나만 가집니다.',
      app_connection_status ENUM('connected','not_connected') NOT NULL DEFAULT 'not_connected' COMMENT '스튜디오 앱 연결 상태입니다. connected=연결, not_connected=미연결입니다.',
      member_status ENUM('active','inactive','expired','archived') NOT NULL DEFAULT 'active' COMMENT '스튜디오 회원관리 상태입니다. active=관리 대상, inactive=수강권 없음/휴면, expired=수강권 만료, archived=관리 제외입니다.',
      gender VARCHAR(20) NULL COMMENT '회원 성별입니다. 운영 상담과 통계 확인에 사용합니다.',
      birth_date DATE NULL COMMENT '회원 생년월일입니다. 생일 안내나 연령대 확인에 사용합니다.',
      address VARCHAR(255) NULL COMMENT '회원 기본 주소입니다.',
      address_detail VARCHAR(255) NULL COMMENT '동, 호수 등 상세 주소입니다.',
      primary_instructor VARCHAR(120) NULL COMMENT '회원의 주 담당강사 이름입니다.',
      registered_at DATETIME NULL COMMENT '스튜디오 회원으로 처음 등록된 날짜입니다. 없으면 통합회원 가입일을 참고합니다.',
      created_at DATETIME NOT NULL COMMENT '스튜디오 운영 프로필이 생성된 날짜와 시간입니다.',
      updated_at DATETIME NOT NULL COMMENT '스튜디오 운영 프로필이 마지막으로 수정된 날짜와 시간입니다.',
      CONSTRAINT fk_studio_member_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) COMMENT='필라테스 운영에 필요한 회원 상세 정보를 보관합니다. 로그인 계정(users)과 분리해 성별, 생년월일, 주소, 앱 연결 여부, 담당강사 같은 센터 운영 정보를 관리합니다.'
  `);
  if (!(await databaseColumnExists("studio_member_profiles", "member_status"))) {
    await pool.query(`
      ALTER TABLE studio_member_profiles
      ADD COLUMN member_status ENUM('active','inactive','expired','archived') NOT NULL DEFAULT 'active'
      COMMENT '스튜디오 회원관리 상태입니다. active=관리 대상, inactive=수강권 없음/휴면, expired=수강권 만료, archived=관리 제외입니다.'
      AFTER app_connection_status
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_passes (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      pass_name VARCHAR(160) NOT NULL,
      pass_type ENUM('personal','duet','group') NOT NULL DEFAULT 'group',
      remaining_count INT NOT NULL DEFAULT 0,
      total_count INT NOT NULL DEFAULT 0,
      expires_at DATETIME NULL,
      status ENUM('active','paused','transferred','refunded') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_studio_passes_user (user_id),
      INDEX idx_studio_passes_status (status)
    )
  `);
  if (!(await databaseColumnExists("studio_passes", "is_family_pass"))) {
    await pool.query(`
      ALTER TABLE studio_passes
      ADD COLUMN is_family_pass TINYINT(1) NOT NULL DEFAULT 0 COMMENT '패밀리 수강권 여부입니다. 1이면 가족과 함께 쓰는 수강권, 0이면 개인 수강권입니다.'
      AFTER expires_at
    `);
  }
  if (!(await databaseColumnExists("studio_passes", "reservable_count"))) {
    await pool.query(`
      ALTER TABLE studio_passes
      ADD COLUMN reservable_count INT NULL COMMENT '현재 예약 가능한 횟수입니다. 보통 잔여횟수와 같지만 운영 정책에 따라 다르게 관리할 수 있습니다.'
      AFTER remaining_count
    `);
  }
  if (!(await databaseColumnExists("studio_passes", "cancellable_count"))) {
    await pool.query(`
      ALTER TABLE studio_passes
      ADD COLUMN cancellable_count INT NULL COMMENT '현재 취소 가능한 횟수입니다. 취소 제한 정책이 있을 때 별도로 관리합니다.'
      AFTER reservable_count
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_pass_payments (
      id VARCHAR(80) PRIMARY KEY COMMENT '수강권 결제 기록의 고유 번호입니다.',
      pass_id VARCHAR(80) NOT NULL COMMENT '결제된 수강권(studio_passes.id)과 연결되는 값입니다.',
      user_id VARCHAR(64) NOT NULL COMMENT '결제한 회원(users.id)과 연결되는 값입니다.',
      payment_type VARCHAR(40) NULL COMMENT '결제구분입니다. 신규결제, 재결제, 환불, 조정처럼 운영자가 구분해서 기록합니다.',
      amount INT NOT NULL DEFAULT 0 COMMENT '수강권 결제금액입니다.',
      paid_at DATETIME NULL COMMENT '결제가 이루어진 날짜와 시간입니다.',
      payment_method VARCHAR(40) NULL COMMENT '결제방법입니다. 카드, 계좌이체, 현금 등으로 기록합니다.',
      installment_months VARCHAR(20) NULL COMMENT '카드 할부개월수입니다. 일시불이면 0 또는 1로 기록할 수 있습니다.',
      note VARCHAR(255) NULL COMMENT '결제와 관련해 관리자가 남기는 참고 메모입니다.',
      created_at DATETIME NOT NULL COMMENT '결제 기록이 생성된 날짜와 시간입니다.',
      updated_at DATETIME NOT NULL COMMENT '결제 기록이 마지막으로 수정된 날짜와 시간입니다.',
      INDEX idx_studio_pass_payments_pass (pass_id, paid_at),
      INDEX idx_studio_pass_payments_user (user_id, paid_at),
      CONSTRAINT fk_studio_pass_payments_pass FOREIGN KEY (pass_id) REFERENCES studio_passes(id) ON DELETE CASCADE,
      CONSTRAINT fk_studio_pass_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) COMMENT='필라테스 수강권별 결제 정보를 보관합니다. 한 회원이 여러 수강권을 결제할 수 있으므로 수강권(studio_passes)과 연결해 결제구분, 금액, 결제일, 결제방법, 할부개월수를 관리합니다.'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_bookings (
      id VARCHAR(80) PRIMARY KEY,
      class_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      pass_id VARCHAR(80) NULL,
      status ENUM('reserved','waitlisted','cancelled') NOT NULL DEFAULT 'reserved',
      booked_at DATETIME NOT NULL,
      cancelled_at DATETIME NULL,
      UNIQUE KEY uq_studio_booking_user_class (class_id, user_id),
      INDEX idx_studio_bookings_class_status (class_id, status, booked_at),
      INDEX idx_studio_bookings_user (user_id),
      CONSTRAINT fk_studio_bookings_class FOREIGN KEY (class_id) REFERENCES studio_classes(id) ON DELETE CASCADE,
      CONSTRAINT fk_studio_bookings_pass FOREIGN KEY (pass_id) REFERENCES studio_passes(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_pass_transactions (
      id VARCHAR(80) PRIMARY KEY,
      pass_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      class_id VARCHAR(80) NULL,
      delta_count INT NOT NULL,
      reason VARCHAR(80) NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_pass_tx_pass (pass_id, created_at),
      INDEX idx_studio_pass_tx_user (user_id, created_at),
      CONSTRAINT fk_studio_pass_tx_pass FOREIGN KEY (pass_id) REFERENCES studio_passes(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_class_recurrences (
      id VARCHAR(80) PRIMARY KEY,
      repeat_group_id VARCHAR(80) NOT NULL,
      weekday TINYINT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      weeks INT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_recur_group (repeat_group_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_business_hours (
      id VARCHAR(80) PRIMARY KEY,
      weekday TINYINT NOT NULL,
      open_time TIME NOT NULL,
      close_time TIME NOT NULL,
      is_closed TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_studio_business_hours_weekday (weekday)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_holidays (
      id VARCHAR(80) PRIMARY KEY,
      holiday_date DATE NOT NULL,
      title VARCHAR(160) NOT NULL,
      note VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_holidays_date (holiday_date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_booking_policies (
      id VARCHAR(80) PRIMARY KEY,
      reserve_limit_hours INT NOT NULL DEFAULT 24,
      cancel_limit_hours INT NOT NULL DEFAULT 6,
      same_day_change_allowed TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_checkins (
      id VARCHAR(80) PRIMARY KEY,
      class_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      booking_id VARCHAR(80) NULL,
      status ENUM('checked_in','no_show','cancelled') NOT NULL DEFAULT 'checked_in',
      checked_in_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_checkins_class (class_id),
      INDEX idx_studio_checkins_user (user_id),
      CONSTRAINT fk_studio_checkins_class FOREIGN KEY (class_id) REFERENCES studio_classes(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_arrears (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      amount INT NOT NULL DEFAULT 0,
      reason VARCHAR(255) NOT NULL,
      status ENUM('open','resolved') NOT NULL DEFAULT 'open',
      due_date DATE NULL,
      created_at DATETIME NOT NULL,
      resolved_at DATETIME NULL,
      INDEX idx_studio_arrears_user (user_id, status),
      INDEX idx_studio_arrears_status (status)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_lockers (
      id VARCHAR(80) PRIMARY KEY,
      locker_no VARCHAR(40) NOT NULL,
      location VARCHAR(120) NULL,
      status ENUM('available','occupied','maintenance') NOT NULL DEFAULT 'available',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_studio_locker_no (locker_no)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_locker_assignments (
      id VARCHAR(80) PRIMARY KEY,
      locker_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NULL,
      status ENUM('active','ended') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL,
      ended_at DATETIME NULL,
      INDEX idx_studio_locker_assign_user (user_id, status),
      INDEX idx_studio_locker_assign_locker (locker_id, status),
      CONSTRAINT fk_studio_locker_assign_locker FOREIGN KEY (locker_id) REFERENCES studio_lockers(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_notifications (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      type VARCHAR(60) NOT NULL,
      title VARCHAR(160) NOT NULL,
      message TEXT NOT NULL,
      status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
      scheduled_at DATETIME NULL,
      sent_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_notifications_user (user_id, created_at),
      INDEX idx_studio_notifications_status (status, scheduled_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_notification_logs (
      id VARCHAR(80) PRIMARY KEY,
      notification_id VARCHAR(80) NOT NULL,
      channel ENUM('sms','push','email') NOT NULL,
      result_status ENUM('sent','failed') NOT NULL,
      provider_message_id VARCHAR(120) NULL,
      error_message VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_notification_logs_notification (notification_id),
      CONSTRAINT fk_studio_notification_logs_notification
        FOREIGN KEY (notification_id) REFERENCES studio_notifications(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_instructor_hours (
      id VARCHAR(80) PRIMARY KEY,
      instructor_name VARCHAR(120) NOT NULL,
      weekday TINYINT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_off TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_studio_instructor_hours (instructor_name, weekday)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_role_permissions (
      id VARCHAR(80) PRIMARY KEY,
      role_code VARCHAR(40) NOT NULL,
      permission_code VARCHAR(80) NOT NULL,
      is_allowed TINYINT(1) NOT NULL DEFAULT 1,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_studio_role_permission (role_code, permission_code)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_staff_profiles (
      id VARCHAR(80) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      role_code ENUM('owner','manager','instructor') NOT NULL DEFAULT 'instructor',
      employment_type ENUM('full_time','part_time','freelance') NOT NULL DEFAULT 'full_time',
      phone VARCHAR(80) NULL,
      app_connection_status ENUM('connected','not_connected') NOT NULL DEFAULT 'not_connected',
      color VARCHAR(20) NOT NULL DEFAULT '#4aa3ff',
      status ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
      can_manage_schedule TINYINT(1) NOT NULL DEFAULT 1,
      can_view_members TINYINT(1) NOT NULL DEFAULT 1,
      can_manage_passes TINYINT(1) NOT NULL DEFAULT 0,
      can_view_sales TINYINT(1) NOT NULL DEFAULT 0,
      salary_type ENUM('fixed','hourly','commission') NOT NULL DEFAULT 'fixed',
      base_pay INT NOT NULL DEFAULT 0,
      hourly_wage INT NOT NULL DEFAULT 0,
      commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      memo TEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_studio_staff_profiles_status (status, role_code),
      UNIQUE KEY uq_studio_staff_profiles_name (name)
    ) COMMENT='스튜디오 운영자가 관리하는 강사·매니저 프로필과 앱연결, 권한, 급여 기준을 보관합니다.'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_member_memos (
      id VARCHAR(80) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      author_id VARCHAR(64) NOT NULL,
      memo TEXT NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      INDEX idx_studio_member_memos_user (user_id, created_at)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_pass_pauses (
      id VARCHAR(80) PRIMARY KEY,
      pass_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_pass_pauses_pass (pass_id),
      CONSTRAINT fk_studio_pass_pauses_pass FOREIGN KEY (pass_id) REFERENCES studio_passes(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_pass_transfers (
      id VARCHAR(80) PRIMARY KEY,
      pass_id VARCHAR(80) NOT NULL,
      from_user_id VARCHAR(64) NOT NULL,
      to_user_id VARCHAR(64) NOT NULL,
      transfer_count INT NOT NULL DEFAULT 0,
      reason VARCHAR(255) NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_studio_pass_transfers_pass (pass_id),
      CONSTRAINT fk_studio_pass_transfers_pass FOREIGN KEY (pass_id) REFERENCES studio_passes(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS studio_pass_refunds (
      id VARCHAR(80) PRIMARY KEY,
      pass_id VARCHAR(80) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      refund_amount INT NOT NULL DEFAULT 0,
      reason VARCHAR(255) NULL,
      status ENUM('requested','approved','rejected') NOT NULL DEFAULT 'requested',
      requested_at DATETIME NOT NULL,
      resolved_at DATETIME NULL,
      INDEX idx_studio_pass_refunds_pass (pass_id, status),
      CONSTRAINT fk_studio_pass_refunds_pass FOREIGN KEY (pass_id) REFERENCES studio_passes(id) ON DELETE CASCADE
    )
  `);

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
