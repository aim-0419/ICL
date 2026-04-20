import { createApp } from "./app.js";
import { env } from "./config/env.js";

// 백엔드 서버의 실제 실행 진입점이다.
// Express 앱을 생성한 뒤 환경변수에 정의된 포트에서 API 서버를 시작한다.
const app = createApp();

app.listen(env.port, () => {
  console.log(`[backend] API server running at http://localhost:${env.port}`);
});
