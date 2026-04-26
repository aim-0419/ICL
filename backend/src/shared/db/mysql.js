// 파일 역할: MySQL 연결 풀, 스키마 자동 보정, 기본 데이터 시드, 공통 query 헬퍼를 담당합니다.
import mysql from "mysql2/promise";
import { env } from "../../config/env.js";

// 이 파일은 MySQL 연결, 테이블 보정, 기본 시드 데이터 주입까지 함께 담당한다.
// 별도 마이그레이션 도구 없이 앱 시작 시 필요한 스키마를 맞추는 구조다.
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

const DEFAULT_ACADEMY_VIDEO_META = [
  { id: "video-1",  instructor: "ICL Academy",      category: "입문", badge: "",    rating: 4.9, reviews: 530, imagePath: null, videoPath: null },
  { id: "video-2",  instructor: "ICL Academy",      category: "초급", badge: "New", rating: 5.0, reviews: 100, imagePath: null, videoPath: null },
  { id: "video-3",  instructor: "Master Instructor", category: "입문", badge: "New", rating: 4.8, reviews: 72,  imagePath: null, videoPath: null },
  { id: "video-4",  instructor: "Studio Coaching",  category: "중급", badge: "Hot", rating: 4.7, reviews: 61,  imagePath: null, videoPath: null },
  { id: "video-5",  instructor: "Neo Team",         category: "입문", badge: "New", rating: 5.0, reviews: 8,   imagePath: null, videoPath: null },
  { id: "video-6",  instructor: "Pro Coach",        category: "초급", badge: "",    rating: 4.8, reviews: 43,  imagePath: null, videoPath: null },
  { id: "video-7",  instructor: "Content Bridge",   category: "중급", badge: "",    rating: 4.9, reviews: 25,  imagePath: null, videoPath: null },
  { id: "video-8",  instructor: "ICL Business",     category: "고급", badge: "Hot", rating: 5.0, reviews: 14,  imagePath: null, videoPath: null },
  { id: "video-9",  instructor: "AhaLinux",         category: "중급", badge: "New", rating: 4.7, reviews: 12,  imagePath: null, videoPath: null },
  { id: "video-10", instructor: "Sunny Studio",     category: "고급", badge: "",    rating: 4.6, reviews: 30,  imagePath: null, videoPath: null },
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
  { id: "event-1", title: "신규 회원 웰컴 패키지 증정 이벤트", status: "진행중", startDate: "2026-04-05", endDate: "2026-04-30", likes: 48, image: "", summary: "첫 등록 회원에게 체형 분석 1회 + 개인 루틴 카드 + 필라테스 밴드를 함께 제공하는 봄 시즌 한정 프로모션입니다." },
  { id: "event-2", title: "강사용 큐잉 가이드 봄 시즌 할인",   status: "진행중", startDate: "2026-03-28", endDate: "2026-04-18", likes: 31, image: "", summary: "큐잉 실전 가이드 영상 패키지를 기간 한정가로 제공하며, 구매자 대상 라이브 Q&A 세션 참여 혜택이 포함됩니다." },
  { id: "event-3", title: "리뉴얼 오픈 기념 상담 혜택",         status: "종료",   startDate: "2026-03-01", endDate: "2026-03-15", likes: 64, image: "", summary: "리뉴얼 기간 동안 진행된 상담 이벤트로, 신규 상담 고객에게 수업 체험권과 등록 할인 혜택을 제공했습니다." },
  { id: "event-4", title: "회원 추천 리워드 프로그램",           status: "진행중", startDate: "2026-04-01", endDate: "2026-05-01", likes: 19, image: "", summary: "기존 회원이 친구를 추천하면 추천인/피추천인 모두에게 수강 할인 쿠폰과 굿즈 포인트를 지급하는 이벤트입니다." },
  { id: "event-5", title: "주말 집중 리포머 클래스 특가",        status: "종료",   startDate: "2026-02-10", endDate: "2026-02-28", likes: 27, image: "", summary: "주말 시간대 집중 프로그램을 한정 오픈했던 이벤트로, 단기 집중 수업을 원하는 회원 중심으로 운영되었습니다." },
  { id: "event-6", title: "강사 역량 업 세미나 모집 이벤트",     status: "종료",   startDate: "2026-01-20", endDate: "2026-02-05", likes: 15, image: "", summary: "강사 대상 시퀀스 설계 세미나 참가자 모집 이벤트로, 우수 후기 작성자에게 추가 교육 콘텐츠를 제공했습니다." },
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
  charset: "utf8mb4",
  connectionLimit: 10,
  waitForConnections: true,
  namedPlaceholders: true,
  timezone: "Z",
});

let initPromise = null;

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
    birth_year: "연령대 통계 산출용 출생연도 값",
    points: "포인트 적립/차감 계산 기준 잔액 값",
    account_status: "계정 활성/탈퇴 상태 판별 값",
    withdrawn_at: "회원 탈퇴 처리 완료 시각 값",
    withdrawal_purge_at: "탈퇴 회원 데이터 파기 예정 시각 값",
    restored_at: "탈퇴 계정 복구 처리 시각 값",
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

  for (const [tableName, columns] of Object.entries(SCHEMA_COLUMN_COMMENTS)) {
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
  // 현재 코드베이스 기준으로 삭제 안전성이 확인된 미사용 테이블/컬럼 없음
  // 운영 데이터 손실 방지를 위해 자동 삭제는 수행하지 않음
}

// 함수 역할: 상품 if 빈값 기본 데이터를 비어 있을 때 주입합니다.
async function seedProductsIfEmpty() {
  // 개발 편의를 위해 기본 상품은 비어 있어도 항상 같은 기준 데이터로 맞춘다.
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

// 함수 역할: 아카데미 강의 영상 if 빈값 기본 데이터를 비어 있을 때 주입합니다.
async function seedAcademyVideosIfEmpty() {
  // 강의 메타 정보는 상품 시드와 1:1로 대응되도록 함께 넣는다.
  for (const video of DEFAULT_ACADEMY_VIDEO_META) {
    const product = ACADEMY_VIDEO_PRODUCTS.find((item) => item.id === video.id);
    if (!product) continue;
    const salePrice = Number(product.price) || 0;
    const originalPrice = Math.max(salePrice, Math.round(salePrice * 1.45));

    await pool.execute(
      `INSERT INTO academy_videos (
        id,
        product_id,
        instructor,
        category,
        badge,
        original_price,
        sale_price,
        rating,
        reviews,
      image_path,
      video_path,
      publish_at,
      is_hidden,
      created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, NOW())
      ON DUPLICATE KEY UPDATE
        id = id`,
      [
        video.id,
        video.id,
        video.instructor,
        video.category,
        video.badge || "",
        originalPrice,
        salePrice,
        Number(video.rating) || 0,
      Number(video.reviews) || 0,
      video.imagePath || null,
      video.videoPath || null,
      ]
    );
  }
}

// 함수 역할: 아카데미 차시 if 빈값 기본 데이터를 비어 있을 때 주입합니다.
async function seedAcademyChaptersIfEmpty() {
  await pool.query(
    `INSERT INTO academy_video_chapters (
      id,
      video_id,
      chapter_order,
      title,
      description,
      video_path,
      duration_sec,
      is_preview,
      created_at
    )
    SELECT
      CONCAT(av.id, '-ch-1') AS id,
      av.id AS video_id,
      1 AS chapter_order,
      '1차시' AS title,
      NULL AS description,
      av.video_path,
      0 AS duration_sec,
      0 AS is_preview,
      av.created_at
    FROM academy_videos av
    LEFT JOIN academy_video_chapters chapter
      ON chapter.video_id = av.id
      AND chapter.chapter_order = 1
    WHERE chapter.id IS NULL`
  );
}

// 함수 역할: 강사 if 빈값 기본 데이터를 비어 있을 때 주입합니다.
async function seedInstructorsIfEmpty() {
  const [rows] = await pool.query("SELECT COUNT(*) AS count FROM instructors");
  if (Number(rows?.[0]?.count ?? 0) > 0) return;

  const defaults = [
    {
      id: "instructor-1",
      name: "대표 강사 소개",
      role: "대표원장 · Master Instructor",
      intro: "움직임의 원리를 회원의 몸에 맞게 적용하는 수업을 지향합니다. 정확한 기본기와 섬세한 큐잉으로 변화의 방향을 설계합니다.",
      careers: ["이끌림 필라테스 대표원장", "국내외 필라테스 지도자 과정 이수", "재활/체형교정 기반 개인 레슨 운영"],
      sort_order: 1,
    },
    {
      id: "instructor-2",
      name: "전문 강사팀",
      role: "프로페셔널 티칭 팀",
      intro: "이끌림 강사진은 수업 전후 회원 상태를 꼼꼼히 체크하고, 개인 목표에 맞는 프로그램을 유연하게 조정합니다.",
      careers: ["기구/매트 통합 수업 운영", "회원별 컨디션 기록 및 단계별 피드백", "정기 티칭 트레이닝 진행"],
      sort_order: 2,
    },
    {
      id: "instructor-3",
      name: "케어 & 코칭 팀",
      role: "멤버 케어 팀",
      intro: "첫 상담부터 루틴 정착까지 끝까지 동행합니다. 수업 만족도와 지속 관리 품질을 높이는 커뮤니케이션을 담당합니다.",
      careers: ["상담/예약/수강 관리 프로세스 운영", "회원별 목표 기반 수강 플랜 제안", "수강 후 피드백 및 루틴 코칭"],
      sort_order: 3,
    },
  ];

  for (const inst of defaults) {
    await pool.query(
      `INSERT INTO instructors (id, name, role, intro, careers, image_path, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, NOW())`,
      [inst.id, inst.name, inst.role, inst.intro, JSON.stringify(inst.careers), inst.sort_order]
    );
  }
}

// 함수 역할: 지점 if 빈값 기본 데이터를 비어 있을 때 주입합니다.
async function seedBranchesIfEmpty() {
  const [rows] = await pool.query("SELECT COUNT(*) AS count FROM branches");
  if (Number(rows?.[0]?.count ?? 0) > 0) return;

  const defaults = [
    {
      id: "branch-1",
      name: "이끌림 필라테스 장덕점",
      address: "광주광역시 광산구 풍영로 189, 2층",
      phone: "062-000-0001",
      parking: "건물 앞 주차 가능 (방문 전 문의)",
      lat: 35.188459164928,
      lng: 126.81392571847,
      map_link: "https://www.google.com/maps/search/?api=1&query=35.188459164928,126.81392571847",
      sort_order: 1,
    },
    {
      id: "branch-2",
      name: "이끌림 필라테스 효천점",
      address: "광주광역시 남구 효천2로가길 5, 201-202호",
      phone: "062-000-0002",
      parking: "인근 공영/건물 주차장 이용 가능",
      lat: 35.102161560951,
      lng: 126.87396526156,
      map_link: "https://www.google.com/maps/search/?api=1&query=35.102161560951,126.87396526156",
      sort_order: 2,
    },
  ];

  for (const branch of defaults) {
    await pool.query(
      `INSERT INTO branches (id, name, address, phone, parking, lat, lng, map_link, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [branch.id, branch.name, branch.address, branch.phone, branch.parking, branch.lat, branch.lng, branch.map_link, branch.sort_order]
    );
  }
}

// 함수 역할: 커뮤니티 if 빈값 기본 데이터를 비어 있을 때 주입합니다.
async function seedCommunityIfEmpty() {
  // 후기/이벤트/문의 기본 데이터는 로컬 개발 화면을 바로 확인하기 위한 시드다.
  const [reviewCountRows] = await pool.query("SELECT COUNT(*) AS count FROM review_posts");
  const reviewCount = Number(reviewCountRows?.[0]?.count ?? 0);
  if (reviewCount === 0) {
    for (const post of DEFAULT_REVIEW_POSTS) {
      await pool.execute(
        `INSERT INTO review_posts (id, title, content, author, author_id, date, views, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          post.id,
          post.title,
          post.content || `${post.title}\n후기 게시판 기본 데이터입니다.`,
          post.author,
          post.authorId || null,
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

// 함수 역할: 만료된 탈퇴 회원 데이터를 조건에 맞게 영구 정리합니다.
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
async function initDatabase() {
  // users 테이블은 서비스 확장 과정에서 컬럼이 늘어났기 때문에,
  // 존재 여부를 확인하면서 점진적으로 스키마를 보정한다.
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
      user_grade VARCHAR(20) NOT NULL DEFAULT 'member',
      birth_year SMALLINT NULL,
      points INT NOT NULL DEFAULT 0,
      account_status VARCHAR(20) NOT NULL DEFAULT 'active',
      withdrawn_at DATETIME NULL,
      withdrawal_purge_at DATETIME NULL,
      restored_at DATETIME NULL,
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

  const [birthYearColumnRows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'birth_year'`
  );
  const hasBirthYearColumn = Number(birthYearColumnRows?.[0]?.count ?? 0) > 0;

  if (!hasBirthYearColumn) {
    await pool.query(`ALTER TABLE users ADD COLUMN birth_year SMALLINT NULL AFTER user_grade`);
  }

  await pool.query(`ALTER TABLE users MODIFY birth_year SMALLINT NULL`);

  // users.points 컬럼 (포인트 잔액)
  const [pointsColRows] = await pool.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'points'`
  );
  if (Number(pointsColRows?.[0]?.count ?? 0) === 0) {
    await pool.query(`ALTER TABLE users ADD COLUMN points INT NOT NULL DEFAULT 0 AFTER birth_year`);
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
      customer_email VARCHAR(190) NULL,
      payload JSON NOT NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_orders_created_at (created_at),
      INDEX idx_orders_customer_email (customer_email)
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
      customer_email VARCHAR(190) NOT NULL,
      selected_product_ids JSON NOT NULL,
      requested_amount INT NOT NULL DEFAULT 0,
      reason TEXT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      admin_note TEXT NULL,
      created_at DATETIME NOT NULL,
      resolved_at DATETIME NULL,
      INDEX idx_refund_requests_order (order_id),
      INDEX idx_refund_requests_user (user_id),
      INDEX idx_refund_requests_status (status)
    )
  `);

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

  await seedProductsIfEmpty();
  await seedAcademyVideosIfEmpty();
  await seedAcademyChaptersIfEmpty();
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

  await seedInstructorsIfEmpty();
  await seedBranchesIfEmpty();

  await seedCommunityIfEmpty();

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

  await dropUnusedSchemaObjects();
  await ensureUtf8mb4TableCollation();
  await repairLegacyMojibakeData();
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

// 함수 역할: 서버 상태 확인을 위해 MySQL 연결이 살아 있는지 검사합니다.
export async function pingDatabase() {
  await pool.query("SELECT 1");
}
