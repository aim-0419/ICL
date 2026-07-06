// 앱 시작 시 mysql.js의 기본 스키마 보정 이후 실행되는 추가 마이그레이션 진입점입니다.
// 현재 별도 마이그레이션은 없지만 import 경로를 유지해 서버 시작 오류를 막습니다.
export async function runMigrations() {
  return undefined;
}
