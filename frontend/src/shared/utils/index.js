/**
 * [공통 유틸리티 내보내기]
 *
 * shared/utils/ 폴더의 모든 공통 함수를 한 곳에서 내보냅니다.
 * 페이지 컴포넌트에서는 아래처럼 가져다 쓰면 됩니다:
 *
 *   import { formatDate, formatCurrency, getRefundStatusLabel } from "../../../shared/utils/index.js";
 *
 * ─ 파일 구성 ──────────────────────────────────────────────────────
 *  format.js  : 날짜·금액·시간을 화면 표시용 문자열로 변환하는 함수
 *  status.js  : 환불·예약·결제 상태 코드를 한글 이름·CSS 클래스로 변환하는 함수
 */
export * from "./format.js";
export * from "./status.js";
