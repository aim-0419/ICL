# ICL Pilates Monorepo

## Docker Demo

내일 시연처럼 로컬에서 한 번에 띄울 때는 Docker Compose를 사용합니다.

```bash
docker compose up --build
```

- 데모 URL: `http://localhost:8080`
- API 헬스체크: `http://localhost:8080/api/health`
- MySQL 로컬 포트: `3307`
- 업로드 파일과 DB는 Docker volume에 보관됩니다.

데모 관리자 계정은 Docker Compose에서만 자동 생성됩니다.

```text
ID: demo-admin
PW: demo-admin-1234
```

데모 데이터를 처음부터 다시 만들고 싶으면 아래처럼 volume까지 삭제합니다.

```bash
docker compose down -v
docker compose up --build
```

운영 배포에서는 `DEMO_ADMIN_ENABLED=false`로 두거나 해당 환경변수를 제거해야 합니다.

프로젝트를 `frontend`와 `backend`로 분리하고, 각 영역 안에서도 기능별 폴더로 재구성했습니다.

## 디렉터리 구조

```text
HomePage/
  frontend/
    src/
      app/
      features/
        auth/
        cart/
        home/
        mypage/
        payment/
      shared/
    public/
  backend/
    src/
      config/
      features/
        auth/
        users/
        products/
        cart/
        orders/
        payments/
      shared/
```

## Frontend 실행

```bash
cd frontend
npm install
npm run dev
```

- React + Vite 기반
- 로고/갤러리 이미지는 `frontend/public/assets/images/` 사용

## Backend 실행

```bash
cd backend
npm install
npm run dev
```

- Express 기반 API 골격
- 헬스체크: `GET /api/health`
- 기능별 라우트: `/api/auth`, `/api/users`, `/api/products`, `/api/cart`, `/api/orders`, `/api/payments`

## 배포

- EC2 (Ubuntu 24.04) + Nginx + PM2
- `merge` 브랜치 푸시 시 GitHub Actions로 자동 배포

## 참고

- 현재 backend는 기능별 구조를 먼저 잡은 상태이며, DB/인증/JWT/실결제 승인 로직은 이후 연결 단계입니다.
- 프론트는 기존 아이보리-골드 UI를 유지한 채 React 라우팅 구조로 동작합니다.
