# nginx 설정 일원화 (Phase 2) — 2026-08-21

- 목적: 실서버에 수동으로 넣은 프록시 헤더 설정이 저장소에 없어 다음 사람이 같은 함정에 빠지는 상황을 없앤다
- 상태: **저장소 작업 완료 / 서버 1회 수동 작업 대기** (배포·SSH·병합 없음)
- 승인 반영: 분리안 + include 방식, `sites-enabled/default` 제거(워크플로우가 아닌 수동), 파일명 `deploy/nginx-icl-app.conf`

## 0. 확정된 전제

| 파일 | 성격 | 실트래픽 | 배포가 건드리는가 |
|---|---|---|---|
| `/etc/nginx/sites-enabled/default` | 실제 파일 | **못 받음** (`server_name _`) | 기존: cp 로 덮어씀 → **이번에 제거** |
| `/etc/nginx/sites-enabled/icl` | **심볼릭 링크** → `sites-available/icl` | **전부 처리** (icl-pilates.com, 443 ssl) | 아니오 (certbot 관리) |

두 파일이 별개라 배포가 TLS를 파괴하지는 않았다. 문제는 **저장소가 관리하는 파일이 실서비스에 아무 영향을 주지 못한다**는 점이었다. Phase 1의 수동 변경(X-Forwarded-For 등)도 저장소에 없어 서버 재구축 때 유실된다.

---

## 1. 만든 것 — `deploy/nginx-icl-app.conf`

server 블록이 아니라 **그 안에 들어가는 조각**이다. `location` 들과 `client_max_body_size` 만 담는다.

certbot 관리 항목(`listen 443 ssl`, `ssl_certificate*`, `include options-ssl-nginx.conf`, `ssl_dhparam`, `server_name`, `root`, 80 리다이렉트 server 블록)은 **넣지 않았다.** 인증서 경로가 `icl-pilates.com-0001` 로 재발급 이력이 있어 또 바뀔 수 있고, 저장소가 그 값을 들고 있으면 배포 시점에 없는 인증서를 가리켜 nginx 기동이 실패한다.

### `client_max_body_size` 배치 — server 블록이 아니라 조각 안에 둔다

`location` 단위로도 지정할 수 있지만 **조각 최상단에 한 번만** 두는 방식을 택했다.

- 이 값이 필요한 곳은 `/api/`(영상·이미지 업로드)와 `/uploads/` 두 곳이다. 각 `location` 에 중복 기술하면 한쪽만 고치는 실수가 난다.
- server 블록에 두면 **certbot 관리 파일을 다시 손대야** 한다. 조각 안에 두면 저장소만 고치면 된다.
- include 는 server 블록 안에서 이뤄지므로 조각 최상단의 지시어는 그 server 전체에 적용된다. 결과는 server 블록에 쓴 것과 같다.

**값은 기본 200M 을 유지하고, 5120m 는 업로드 엔드포인트에서만 올린다.**

코드상 영상 업로드 상한은 5GB(`asset.service.js:24` `ACADEMY_VIDEO_UPLOAD_MAX_BYTES`)라 nginx 가 그보다 낮은 값으로 먼저 413 을 반환하면 코드 상한이 무의미해진다. 그러나 5GB 가 필요한 경로는 `POST /api/academy/uploads` **하나뿐**이다.

전역에 5120m 를 두면 `location /`(정적 파일)을 포함한 모든 경로가 5GB 본문을 받아들인다. `location /` 에는 `proxy_request_buffering off` 가 걸려 있지 않아 nginx 가 405 를 돌려주기 전에 **본문을 디스크에 먼저 버퍼링**한다. 인증 없이도 디스크를 채울 수 있는 경로가 생기므로 전역값은 낮게 두고 필요한 곳만 올린다.

경로 근거: `app.js:163` 이 `/api/academy` 에 라우터를 붙이고, `academy.routes.js:73` 이 `/uploads` 를 등록하며, 프론트는 `academyApi.js:186` 에서 `${API_BASE_URL}/academy/uploads?...` 를 호출한다 → 최종 `/api/academy/uploads`. 쿼리스트링은 location 매칭에 영향을 주지 않는다.

`location = /api/academy/uploads` 는 **완전일치**라 접두사 매칭인 `location /api/` 보다 우선하며, 둘은 별개의 location 이라 중복 정의가 아니다.

커뮤니티 업로드는 `community.routes.js:56` 에서 별도로 100MB 로 제한된다.

### 포함 항목과 근거

| 항목 | 내용 | 근거 |
|---|---|---|
| `/api/` | proxy + 헤더 4종 + 타임아웃 3600s + `proxy_request_buffering off` + `proxy_http_version 1.1` | 5GB 업로드는 100Mbps에서 약 7분, 20Mbps에서 약 34분. 기본 60초로는 수백 MB급도 끊긴다. 버퍼링을 끄면 디스크 이중 저장이 없어진다(백엔드는 이미 스트리밍 수신) |
| `/uploads/` | **proxy 유지** + 헤더 4종 + 타임아웃 | alias로 바꾸면 `app.js:79-95` 의 nosniff·CSP가 사라져 S-9이 되살아나고 영상 차단도 우회된다 |
| `/uploads/academy/videos/` | `return 403` | 백엔드 `app.js:176-177` 과 이중 방어. nginx에서 끊으면 Node에 도달하지 않고, 훗날 정적 서빙으로 바꿔도 마지막 방어선이 된다. **`/uploads/` 보다 먼저 선언**해야 우선 매칭된다 |
| `/assets/` | `expires 1y` + `immutable` | Vite 해시 파일명이라 캐시 무효화 위험 없음 |
| `/` | `try_files $uri /index.html` | 실서버 현행 유지 |

### 제외 항목

- **`/uploads/` 30일 캐시**: 프록시 경유라 백엔드가 `Cache-Control` 을 직접 정한다. nginx `add_header` 를 얹으면 이중으로 붙어 혼선이 생긴다
- **`location /` 의 `no-store`**: SPA로 서빙되는 다른 파일에도 영향이 갈 수 있다. 이번 목적(수동 설정의 저장소화)을 넘어서므로 별도 과제
- **`server_name _`**: `default` 를 죽은 설정으로 만든 원인

---

## 2. 배포 워크플로우 수정 (완료)

### 2-1. `cp` 제거

```
- sudo cp ~/ICL/deploy/nginx-prod.conf /etc/nginx/sites-enabled/default
- sudo nginx -t && sudo nginx -s reload
+ sudo nginx -t
+ sudo nginx -s reload
```

`git reset --hard` 로 조각 파일이 갱신되고, include 하고 있는 server 블록이 reload 시 그것을 읽는다. 복사가 필요 없다.

**심볼릭 링크에 `cp` 를 하면 원본이 덮어써진다**(cp는 링크를 역참조). 즉 대상을 `sites-enabled/icl` 로 바꾸는 방식은 certbot 관리 파일인 `sites-available/icl` 을 파괴하므로 절대 쓰면 안 된다.

### 2-2. ★ 셸 옵션 조사 — 결론

**조사 결과**: `appleboy/ssh-action@v1.0.3` 은 `script_stop` 옵션으로 실패 중단을 제어하며, **지정하지 않으면 기본값이 false** 다. 현재 워크플로우에는 이 옵션이 **없다.** 즉 스크립트는 `set -e` 없이 실행되어 **중간 명령이 실패해도 다음 줄이 계속 실행된다.**

**현재 상태 판정**:
- `nginx -t` 실패는 **결과적으로 감지된다.** `sudo nginx -t && sudo nginx -s reload` 가 스크립트의 **마지막 줄**이라, `&&` 단락으로 나온 실패 종료코드가 그대로 스텝 결과가 되기 때문이다.
- 그러나 이는 **"마지막 줄이라서" 우연히 성립하는 안전**이다. 뒤에 명령이 한 줄이라도 추가되면 실패가 묻힌다.
- 더 큰 문제는 **앞 단계다.** `npm run build` 가 실패해도 `pm2 restart` 가 실행되고 nginx reload까지 진행된다. **깨진 빌드가 그대로 배포된다.**

**조치(적용함)**: script 첫 줄에 `set -e` 를 추가했다. `script_stop: true` 대신 `set -e` 를 택한 이유는 스크립트 안에 명시적으로 보여 다음 사람이 알아보기 쉽고, 액션 버전 교체와 무관하기 때문이다.

**기존 동작이 깨지지 않는지 확인함**:

| 기존 라인 | `set -e` 영향 |
|---|---|
| `mysqldump ... 2>/dev/null \|\| true` | `\|\| true` 로 흡수 — 영향 없음 |
| `find ~/backups ... \|\| true` | 동일 — 영향 없음 |
| `grep ... \| cut ... \|\| true` | 동일 — 영향 없음 |
| `if grep -q ...; then` | 조건문 안의 실패는 `set -e` 대상이 아님 — 영향 없음 |
| `pm2 describe ... && pm2 restart ... \|\| pm2 start ...` | `\|\|` 로 대안이 있어 실패로 끝나지 않음 — 영향 없음 |
| `mysql ... < seed-overrides.sql 2>/dev/null` | **동작이 바뀐다.** 기존에는 실패해도 계속 진행, 이제는 중단. 다만 시드 적용 실패를 무시하고 배포를 이어가는 것이 더 위험하므로 **의도된 개선**으로 본다 (`APPLY_DEPLOY_SEED_OVERRIDES=true` 일 때만 실행되는 경로) |
| `npm install` / `npm run build` | **동작이 바뀐다.** 실패 시 즉시 중단 — 이것이 이번 조치의 핵심 목적 |

### 2-3. `deploy/nginx-prod.conf` 처리 — **참고용으로 보존**

삭제하지 않는다. 이유:

- 이 파일에는 `/assets/` 장기 캐시, `/uploads/academy/videos/` 403 등 **조각으로 옮긴 설정의 출처**가 담겨 있다
- 새 서버를 처음부터 세울 때 server 블록 전체 예시로 참고할 값이 있다
- 다만 **더 이상 배포에 쓰이지 않는다.** 오해를 막기 위해 파일 상단에 그 사실을 주석으로 남기는 것을 다음 작업으로 제안한다(이번에는 파일을 수정하지 않았다)

---

## 0. 서버 사전 조사 결과 (2026-08-21 실측)

실서버 EC2 에서 읽기 전용으로 확인한 사실이다. **다음 사람이 같은 조사를 반복하지 않도록** 남긴다.

### 0-1. `sites-available/icl` 의 server 블록에 `add_header` 가 하나도 없다

```
sudo grep -n add_header /etc/nginx/sites-available/icl
```

결과 없음. 조각의 `/assets/` 블록이 `add_header` 를 써서 상속을 끊더라도 **잃을 헤더가 없다.** 따라서 이번 작업에서 `/assets/` 를 손볼 필요가 없다(주의 주석만 남겼다).

### 0-2. 인증서 자동 갱신이 `default` 제거와 무관하다

```
sudo grep -nE "authenticator|installer" /etc/letsencrypt/renewal/*.conf
sudo certbot renew --dry-run
```

`authenticator = nginx`, `installer = nginx` 이며 **dry-run 전부 성공**했다. `sites-enabled/default` 를 제거해도 갱신이 끊기지 않는다는 뜻이다.

다만 `installer = nginx` 이므로 certbot 은 `icl` 파일을 직접 수정할 권한을 갖는다. 인증서를 재발급·확장하면 include 라인이 사라질 수 있어, 갱신 후 확인이 필요하다(5절 위험표).

### 0-3. `sites-enabled/default` 가 실제로 트래픽을 받고 있다

```
sudo cat /etc/nginx/sites-enabled/default
```

```
listen 80;            (443 없음)
server_name _;
root /home/ubuntu/ICL/frontend/dist;
```

`default_server` 키워드는 없지만 nginx 가 `sites-enabled/*` 를 **알파벳 순으로 읽어** `default` 가 `icl` 보다 먼저 로드된다. 그래서 80 포트의 **암묵적 기본 서버**가 되어, Host 가 도메인과 다른 HTTP 요청(IP 직접 접근, 봇 스캔)을 받아 **앱 dist 를 평문 HTTP 로 서빙**하고 있다. 443 에는 관여하지 않는다(icl 단독).

→ 제거가 위험이 아니라 **개선**인 근거다(7단계).

### 0-4. include 라인이 아직 없고 상한은 200M 이다

```
sudo grep -nE "include|client_max_body_size" /etc/nginx/sites-available/icl
```

include 라인 없음, `client_max_body_size 200M`. 조각의 기본값을 200M 으로 맞춘 이유이며(1절), 3단계에서 이 줄을 지우고 include 로 대체한다.

---

## 3. 서버 1회 수동 작업 절차서

AWS 콘솔 터미널(EC2 Instance Connect)에서 수행한다. **브라우저 터미널은 긴 붙여넣기가 깨지므로 명령을 짧게 나눴다.**

### 준비 — 현재 상태 확인

```
ls -l /etc/nginx/sites-enabled/
```
`icl` 이 심볼릭 링크, `default` 가 실제 파일인지 확인한다.

```
sudo nginx -t
```
지금이 정상인지 먼저 확인한다. 여기서 실패하면 아래를 진행하지 말고 중단한다.

### 1단계 — 백업

```
sudo cp /etc/nginx/sites-available/icl /home/ubuntu/icl.bak.$(date +%Y%m%d_%H%M%S)
```
```
ls -l /home/ubuntu/icl.bak*
```

**여기서 방금 만들어진 파일명(`icl.bak.20260821_HHMMSS`)을 메모해 둔다.** 롤백할 때 이 파일을 써야 한다.

> ⚠️ **확장자 없는 `/home/ubuntu/icl.bak` 는 롤백에 쓰지 마라.**
> 그 파일은 Phase 1 작업 **이전** 상태라, 복원하면 Phase 1 에서 수동으로 넣은
> `X-Forwarded-For` / `X-Forwarded-Proto` 가 함께 사라진다. 그러면 백엔드가 보는
> `req.ip` 가 전부 `127.0.0.1` 로 찍혀 rate limit 이 전 사용자 공용 카운터가 되고,
> S-2 보안 수정이 무효가 된다.

### 2단계 — 조각 파일이 서버에 있는지 확인

```
ls -l /home/ubuntu/ICL/deploy/nginx-icl-app.conf
```
없으면 아직 배포되지 않은 것이다. **이 커밋이 main에 반영된 뒤** 진행해야 한다. 없는 상태로 include를 넣으면 `nginx -t` 가 실패한다.

### 3단계 — `sites-available/icl` 편집

```
sudo nano /etc/nginx/sites-available/icl
```

**지울 것** — 첫 server 블록 안의 아래 세 덩어리 전체:

```
    location /api/ {
        ... (proxy_pass 부터 닫는 중괄호까지)
    }
    location /uploads/ {
        ... (닫는 중괄호까지)
    }
    location / {
        try_files $uri /index.html;
    }
```

그리고 같은 블록 맨 위의 이 한 줄도 지운다 (조각이 대신 정의한다):

```
        client_max_body_size 200M;
```

**넣을 것** — 지운 자리에 한 줄:

```
    include /home/ubuntu/ICL/deploy/nginx-icl-app.conf;
```

**절대 건드리지 말 것** — 아래는 그대로 둔다:
- `server_name icl-pilates.com www.icl-pilates.com;`
- `root /home/ubuntu/ICL/frontend/dist;`
- `index index.html;`
- `listen 443 ssl;` 및 `# managed by Certbot` 이 붙은 모든 줄
- 두 번째 server 블록(80 포트 리다이렉트) 전체

저장은 `Ctrl+O` → `Enter`, 종료는 `Ctrl+X`.

### 4단계 — 문법 검사 (reload 전)

```
sudo nginx -t
```

**실패하면 여기서 멈추고 롤백한다.** 아직 reload하지 않았으므로 서비스는 정상이다.

### 5단계 — 반영

```
sudo systemctl reload nginx
```

### 6단계 — 검증

```
curl -I https://icl-pilates.com
```
200 확인.

```
curl -I http://icl-pilates.com
```
**301** 확인 — TLS 리다이렉트가 살아 있다는 뜻이다.

```
curl -I https://icl-pilates.com/api/health
```
200 확인.

```
curl -sI https://icl-pilates.com/uploads/academy/videos/x.mp4 | head -1
```
**403** 확인.

### 7단계 — `sites-enabled/default` 제거

6단계까지 모두 정상일 때만 진행한다.

```
sudo rm /etc/nginx/sites-enabled/default
```
```
sudo nginx -t
```
```
sudo systemctl reload nginx
```
```
curl -I https://icl-pilates.com
```

미매칭 HTTP 요청이 HTTPS 로 넘어가는지 확인한다.

```
curl -sI -H "Host: example.invalid" http://127.0.0.1/ | head -1
```

기대값은 **301** 이다. 제거 전에는 `default` 가 이 요청을 받아 **200** 과 함께 앱 dist 를 평문으로 내주고 있었다.

**제거가 위험이 아니라 개선인 이유** (서버 실측 근거, 0절 참조):

- `default` 에는 `default_server` 키워드가 없지만, nginx 는 `sites-enabled/*` 를 알파벳 순으로 읽어 `default` 가 `icl` 보다 먼저 로드된다. 그래서 **80 포트의 암묵적 기본 서버**가 되어 있다.
- 그 결과 Host 가 도메인과 다른 HTTP 요청(IP 직접 접근, 봇 스캔)을 실제로 받고 있고, **앱 `dist` 를 평문 HTTP 로 서빙**한다.
- 제거하면 `icl` 의 80 블록이 기본이 되어 같은 요청이 **301 로 HTTPS 에 넘어간다.**
- 443 은 원래 `icl` 단독이라 제거 전후가 같다.

### 롤백 (어느 단계든 실패 시)

먼저 백업 파일명을 확인한다. 1단계에서 만든 **타임스탬프가 붙은** 파일을 써야 한다.

```
ls -l /home/ubuntu/icl.bak*
```

위에서 확인한 이름으로 복원한다.

```
sudo cp /home/ubuntu/icl.bak.<확인한값> /etc/nginx/sites-available/icl
```
```
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ **확장자 없는 `icl.bak` 로 복원하지 마라.** Phase 1 이전 상태라
> `X-Forwarded-For` / `X-Forwarded-Proto` 가 빠져 rate limit 이 무력화된다.

`default` 를 지운 뒤 되돌리려면:

```
sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
```

---

## 4. 문법 검증 방법

**로컬에 nginx가 설치되어 있지 않다.** Windows 개발 환경이라 `nginx -t` 를 실행할 수 없어, 이 조각의 문법은 **로컬에서 검증하지 못했다.**

검증은 다음에 의존한다:

1. **서버 3단계의 `sudo nginx -t`** — reload 전에 수행하므로, 실패해도 서비스에 영향이 없다. 이것이 실질적인 1차 방어선이다
2. 조각은 `location`·`proxy_*`·`expires` 등 표준 지시어만 쓰고 새 문법을 도입하지 않았다
3. `proxy_pass` 대상(`127.0.0.1:4000`)과 헤더 4종은 **현재 실서버에서 동작 중인 값을 그대로 옮겼다**

원한다면 도커로 사전 검증할 수 있다(선택):

```
docker run --rm -v "$PWD/deploy:/etc/nginx/conf.d/frag:ro" nginx:alpine nginx -t
```
단 조각 단독으로는 server 블록이 없어 그대로는 통과하지 않으며, 감싸는 테스트용 server 블록이 필요하다.

---

## 5. 위험 분석

| 시나리오 | 영향 | 예방 | 감지 | 복구 |
|---|---|---|---|---|
| 조각 파일이 서버에 없는 상태로 include | `nginx -t` 실패 → reload 안 됨 | 2단계에서 파일 존재 확인 | 3단계 검사 | include 라인 제거 |
| 조각 문법 오류 | 위와 동일 (reload 차단) | 표준 지시어만 사용 | 3단계 검사 | 커밋 되돌리기 |
| location 중복 정의 | 기동 실패 또는 예상과 다른 라우팅 | 3단계에서 기존 location 제거 | `nginx -t` / 502 | `icl.bak` 복구 |
| `proxy_pass` 포트 오기(4000↔4001) | **전면 502** | 실서버 값 4000 그대로 사용 | 6단계 검증 | `icl.bak` 복구 |
| certbot이 설정을 다시 씀 | include 라인이 사라질 수 있음 | TLS·앱 영역 분리. `renew` 는 설정을 고치지 않고 `--dry-run` 성공 확인(0절) → 위험 낮음. 다만 `installer = nginx` 라 certbot 이 `icl` 파일을 직접 고칠 권한은 있다 | 갱신 후 `sudo grep -n include /etc/nginx/sites-available/icl` | include 라인 재삽입 |
| `default` 제거 후 미매칭 요청 | **개선됨** — 기존에는 `default` 가 앱 dist 를 평문 HTTP 로 서빙했고, 제거 후에는 `icl` 80 블록이 받아 301 로 HTTPS 에 넘긴다. 443 은 원래 `icl` 단독이라 변화 없음 | — | `curl -sI -H "Host: example.invalid" http://127.0.0.1/` 로 301 확인 | 심볼릭 링크 재생성 |
| **최악**: 잘못된 설정이 reload됨 | HTTPS 상실 또는 502 | `nginx -t` 는 문법만 잡고 **의미 오류는 못 잡는다** | 6단계 즉시 확인 | `icl.bak` 즉시 복구 |

`set -e` 추가로 인한 위험도 함께 본다: 기존에 조용히 무시되던 실패(예: seed 적용 실패)가 이제 배포를 중단시킨다. **배포가 더 자주 실패할 수 있으나, 깨진 상태가 운영에 올라가는 것보다 낫다.**

---

## 미해결 항목

1. **서버 1회 수동 작업이 남아 있다** (3절). SSH 접근이 금지되어 사용자가 수행해야 한다
2. 이 커밋이 **main에 반영된 뒤에야** 서버에 조각 파일이 생긴다. 순서를 지켜야 한다 (배포 → 수동 작업)
3. `deploy/nginx-prod.conf` 상단에 "배포에 쓰이지 않음" 주석을 넣는 작업 — 이번에 하지 않았다
4. `location /` HTML 무캐시 정책 — 별도 과제
5. `/uploads/` 캐시 정책을 백엔드에서 어떻게 줄지 미정
6. 로컬 nginx 부재로 조각 문법을 사전 검증하지 못했다 (4절)
7. **`www.icl-pilates.com` 인증서 불일치 — 별도 브랜치로 처리**

   `server_name` 은 `icl-pilates.com` 과 `www.icl-pilates.com` 을 모두 받는데,
   `ssl_certificate` 는 `icl-pilates.com-0001`(단일 도메인)을 가리킨다.
   www 를 포함한 인증서는 `icl-pilates.com`(`-0001` 아님) 쪽이며 현재 사용되지 않는다.
   **인증서 2장이 각각 자동 갱신되고 있다.**

   DNS 상 www 도 같은 IP(3.134.172.138)로 도달하므로 실사용자가 인증서 경고를 볼 수 있다.
   certbot 관리 영역이라 이 브랜치에 섞지 않는다.

## 다음 세션이 해야 할 일

1. 이 변경을 어느 브랜치에 커밋할지 결정 (아래 제안 참조)
2. main 반영 후 3절 절차 수행
3. 6단계 검증 결과를 이 문서에 기록
4. S-5·S-3 커밋 (별개 사안, 검증 완료 상태로 대기 중)
