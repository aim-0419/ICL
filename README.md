# ICL Pilates Monorepo

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

## 참고

- 현재 backend는 기능별 구조를 먼저 잡은 상태이며, DB/인증/JWT/실결제 승인 로직은 이후 연결 단계입니다.
- 프론트는 기존 아이보리-골드 UI를 유지한 채 React 라우팅 구조로 동작합니다.
