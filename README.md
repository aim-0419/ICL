# ICL Pilates — 이끌림 필라테스 플랫폼

이끌림 필라테스의 홈페이지 및 스튜디오 관리 플랫폼입니다.  
회원 관리, 수강권 판매, 아카데미, 강사·스태프 관리, 매출 분석 등 스튜디오 운영에 필요한 기능을 통합 제공합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18, Vite, React Router |
| Backend | Node.js, Express |
| Database | MySQL 8.4 |
| 결제 | PortOne V2 |
| 배포 | EC2 (Ubuntu 24.04), Nginx, PM2 |
| CI/CD | GitHub Actions (`merge` 브랜치 push → 자동 배포) |
| 컨테이너 | Docker Compose (로컬 시연용) |

---

## 주요 기능

- **홈페이지** — 브랜드 소개, SNS 피드(유튜브·블로그·인스타그램) 연동
- **아카데미** — 온라인 강의 판매, 동영상 재생, 수강 진도 관리
- **스튜디오 관리** — 수업 일정, 강사·스태프 관리, 역할별 권한 설정
- **회원 관리** — 회원 목록, 수강권 조회, 엑셀 다운로드
- **수강권 & 결제** — PortOne V2 연동, 환불 처리
- **매출 분석** — 기간별 매출 대시보드
- **커뮤니티** — 공지사항, 게시글

---

## 디렉터리 구조

```
HomePage/
├── frontend/
│   ├── src/
│   │   ├── app/              # 라우터, 전역 설정
│   │   ├── features/
│   │   │   ├── auth/         # 로그인, 회원가입, 비밀번호 찾기
│   │   │   ├── home/         # 메인 홈페이지
│   │   │   ├── academy/      # 아카데미 강의
│   │   │   ├── admin/        # 스튜디오 관리자
│   │   │   ├── studio/       # 스튜디오메이트 API
│   │   │   ├── community/    # 커뮤니티
│   │   │   ├── mypage/       # 마이페이지
│   │   │   ├── payment/      # 결제 성공/실패
│   │   │   ├── brand/        # 브랜드 소개
│   │   │   └── cart/         # 장바구니
│   │   └── shared/           # 공통 컴포넌트, 유틸, 스토어
│   ├── public/assets/        # 이미지, 폰트 등 정적 파일
│   └── styles.css            # 전역 스타일
├── backend/
│   └── src/
│       ├── features/
│       │   ├── auth/         # 인증 (JWT)
│       │   ├── users/        # 회원
│       │   ├── academy/      # 아카데미
│       │   ├── admin/        # 관리자
│       │   ├── studio/       # 스튜디오
│       │   ├── products/     # 수강권 상품
│       │   ├── orders/       # 주문
│       │   ├── payments/     # 결제 (PortOne V2)
│       │   ├── refunds/      # 환불
│       │   ├── cart/         # 장바구니
│       │   ├── community/    # 커뮤니티
│       │   └── brand/        # 브랜드
│       └── shared/           # DB, 미들웨어 등
├── docker-compose.yml
└── deploy/                   # 배포 스크립트
```

---

## 로컬 실행 (개발)

### 사전 준비

- Node.js 20+
- MySQL 8.4 (로컬 또는 Docker)

### Backend

```bash
cd backend
npm install
touch backend/.env     # 아래 환경변수 항목을 참고해 직접 작성
npm run dev
```

- 기본 포트: `4000`
- 헬스체크: `GET http://localhost:4000/api/health`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- 기본 포트: `5173`

---

## 환경변수 (backend/.env)

`backend/.env` 파일을 직접 생성하고 아래 항목을 채워넣습니다.

```env
PORT=4000
CORS_ORIGIN=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=icl_pilates

# PortOne V2 결제
PORTONE_API_SECRET=your_portone_v2_api_secret

# 동영상 재생 토큰
ACADEMY_PLAYBACK_TOKEN_SECRET=replace_with_long_random_secret

# 개인정보 암호화
PII_ENCRYPTION_KEY=replace_with_long_random_encryption_key

# 이메일 발송 (SMTP)
SMTP_HOST=smtp.naver.com
SMTP_PORT=465
SMTP_USER=your_email@naver.com
SMTP_PASS=your_email_password
SMTP_FROM=이끌림 필라테스 <your_email@naver.com>
SITE_URL=https://your-domain.com
```

---

## Docker 시연 (로컬 원클릭 실행)

```bash
docker compose up --build
```

| 항목 | 주소 |
|------|------|
| 데모 사이트 | http://localhost:8080 |
| API 헬스체크 | http://localhost:8080/api/health |
| MySQL 로컬 포트 | 3307 |

**데모 관리자 계정** (Docker Compose 전용 자동 생성)

```
ID: demo-admin
PW: demo-admin-1234
```

데이터를 초기화하려면:

```bash
docker compose down -v
docker compose up --build
```

> 운영 서버에서는 반드시 `DEMO_ADMIN_ENABLED=false`로 설정하거나 해당 환경변수를 제거하세요.

---

## 배포

- 서버: EC2 (Ubuntu 24.04) + Nginx 리버스 프록시 + PM2
- `merge` 브랜치에 push하면 GitHub Actions가 자동으로 배포합니다.

---

## 브랜치 전략

| 브랜치 | 용도 |
|--------|------|
| `main` | 안정 버전 보관 |
| `merge` | 운영 배포 대상 (push 시 자동 배포) |
| `feature/*` | 기능 개발 |
