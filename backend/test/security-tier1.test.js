// 파일 역할: 2026-08-21 보안 hotfix(S-1, S-2, S-6) 재발 방지 회귀 테스트입니다.
//
// 각 테스트는 "취약했던 동작이 막혔는가"와 "정상 사용 경로가 여전히 열려 있는가"를
// 함께 확인합니다. 정상 경로 확인이 없으면 과도한 차단으로 서비스가 막혀도 통과해 버립니다.
import test from "node:test";
import assert from "node:assert/strict";

import { createRateLimiter } from "../src/shared/middlewares/rate-limit.js";

// ─── S-2. Rate limit 우회 (X-Forwarded-For 위장) ────────────────────────────

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

// 클라이언트가 헤더를 보낼 수 있는 상황을 흉내 냅니다.
// Express 는 trust proxy 설정에 따라 req.ip 를 계산하므로, 여기서는 req.ip 를
// 실제 접속 IP로 고정하고 x-forwarded-for 에는 위조 값을 넣습니다.
function createRequest({ ip, forwardedFor, method = "POST", path = "/api/test" }) {
  return {
    ip,
    method,
    path,
    requestId: "req-test",
    get(name) {
      return String(name).toLowerCase() === "x-forwarded-for" ? forwardedFor : undefined;
    },
  };
}

test("S-2: X-Forwarded-For를 매번 바꿔도 rate limit을 우회할 수 없다", () => {
  const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now: () => 1000 });
  let passed = 0;
  let blocked = 0;

  // 같은 접속자(req.ip 동일)가 위조 헤더만 매번 바꿔 4번 요청
  for (let i = 0; i < 4; i += 1) {
    const req = createRequest({ ip: "203.0.113.9", forwardedFor: `10.0.0.${i}` });
    const res = createResponse();
    limiter(req, res, () => { passed += 1; });
    if (res.statusCode === 429) blocked += 1;
  }

  assert.equal(passed, 2, "허용 횟수만큼만 통과해야 합니다.");
  assert.equal(blocked, 2, "초과 요청은 헤더를 바꿔도 차단되어야 합니다.");
});

test("S-2: 서로 다른 실제 IP는 각자 독립된 한도를 가진다", () => {
  const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: () => 1000 });
  let passed = 0;

  for (const ip of ["203.0.113.1", "203.0.113.2", "203.0.113.3"]) {
    const res = createResponse();
    limiter(createRequest({ ip }), res, () => { passed += 1; });
  }

  // 모든 요청이 한 버킷으로 묶이면 여기서 1이 되어 정상 사용자가 막힙니다.
  assert.equal(passed, 3, "다른 사용자의 요청까지 함께 차단되면 안 됩니다.");
});

test("S-2: 정상 요청은 한도 안에서 통과한다", () => {
  const limiter = createRateLimiter({ max: 5, windowMs: 60_000, now: () => 1000 });
  let passed = 0;

  for (let i = 0; i < 5; i += 1) {
    const res = createResponse();
    limiter(createRequest({ ip: "198.51.100.7" }), res, () => { passed += 1; });
  }

  assert.equal(passed, 5);
});

// ─── S-6. 재생 토큰 사용자 바인딩 fail-open ─────────────────────────────────
//
// assertValidSessionState 는 모듈 내부 함수라 직접 호출할 수 없으므로,
// 동일한 판정 규칙을 옮겨 놓고 "비로그인 요청이 통과하지 않는지"를 확인합니다.
// service.js 의 조건식이 바뀌면 이 테스트의 기대값도 함께 검토해야 합니다.
function isUserBindingViolated({ tokenUid, requestUserId }) {
  const uid = String(tokenUid || "").trim();
  const requester = String(requestUserId || "").trim();
  return Boolean(uid) && requester !== uid;
}

test("S-6: 회원 토큰을 비로그인 상태로 사용하면 차단된다", () => {
  assert.equal(
    isUserBindingViolated({ tokenUid: "user-1", requestUserId: "" }),
    true,
    "재생 URL이 유출되어도 비로그인 제3자는 재생할 수 없어야 합니다.",
  );
  assert.equal(isUserBindingViolated({ tokenUid: "user-1", requestUserId: null }), true);
});

test("S-6: 다른 회원 계정으로는 재생할 수 없다", () => {
  assert.equal(isUserBindingViolated({ tokenUid: "user-1", requestUserId: "user-2" }), true);
});

test("S-6: 토큰을 발급받은 본인은 정상 재생된다", () => {
  assert.equal(
    isUserBindingViolated({ tokenUid: "user-1", requestUserId: "user-1" }),
    false,
    "정상 로그인 사용자의 재생이 막히면 안 됩니다.",
  );
});

test("S-6: 미리보기용(uid 없는) 토큰은 비로그인도 재생할 수 있다", () => {
  assert.equal(
    isUserBindingViolated({ tokenUid: "", requestUserId: "" }),
    false,
    "로그인 없이 발급된 미리보기 토큰까지 막으면 안 됩니다.",
  );
});

// ─── S-1. 비밀 Q&A 답변 노출 ────────────────────────────────────────────────
//
// listAcademyQna 는 DB 조회를 포함하므로, 응답을 만드는 가림 규칙만 떼어내
// 질문·답변이 함께 가려지는지 확인합니다.
function maskQnaPost({ post, replies, requestUserId, isAdmin }) {
  const isOwner = requestUserId && String(post.userId) === String(requestUserId);
  const canSee = !post.isSecret || isOwner || isAdmin;
  const visibleReplies =
    canSee && Array.isArray(replies)
      ? replies.map((r) => ({ ...r, isAdmin: Boolean(r.isAdmin) }))
      : [];

  return {
    ...post,
    isSecret: Boolean(post.isSecret),
    title: canSee ? post.title : "비공개 질문입니다.",
    content: canSee ? post.content : "",
    hidden: !canSee,
    replies: visibleReplies,
  };
}

const SECRET_POST = { id: "post-1", userId: "user-1", title: "허리가 불편합니다", content: "상세 증상", isSecret: 1 };
const PUBLIC_POST = { id: "post-2", userId: "user-1", title: "수업 문의", content: "예약 방법", isSecret: 0 };
const REPLIES = [{ id: "reply-1", postId: "post-1", content: "답변 내용입니다", isAdmin: 1 }];

test("S-1: 비밀 질문의 답변이 제3자에게 노출되지 않는다", () => {
  const result = maskQnaPost({ post: SECRET_POST, replies: REPLIES, requestUserId: "user-9", isAdmin: false });

  assert.equal(result.title, "비공개 질문입니다.");
  assert.equal(result.content, "");
  assert.deepEqual(result.replies, [], "비밀 질문의 답변은 비워져야 합니다.");
});

test("S-1: 비로그인 사용자에게도 비밀 질문의 답변이 노출되지 않는다", () => {
  const result = maskQnaPost({ post: SECRET_POST, replies: REPLIES, requestUserId: null, isAdmin: false });

  assert.equal(result.hidden, true);
  assert.deepEqual(result.replies, []);
});

test("S-1: 작성자 본인은 자기 비밀 질문과 답변을 볼 수 있다", () => {
  const result = maskQnaPost({ post: SECRET_POST, replies: REPLIES, requestUserId: "user-1", isAdmin: false });

  assert.equal(result.title, "허리가 불편합니다");
  assert.equal(result.hidden, false);
  assert.equal(result.replies.length, 1, "작성자에게는 답변이 보여야 합니다.");
  assert.equal(result.replies[0].content, "답변 내용입니다");
});

test("S-1: 관리자는 비밀 질문과 답변을 볼 수 있다", () => {
  const result = maskQnaPost({ post: SECRET_POST, replies: REPLIES, requestUserId: "admin-1", isAdmin: true });

  assert.equal(result.hidden, false);
  assert.equal(result.replies.length, 1);
});

test("S-1: 공개 질문은 비로그인 사용자에게도 답변까지 보인다", () => {
  const result = maskQnaPost({ post: PUBLIC_POST, replies: REPLIES, requestUserId: null, isAdmin: false });

  assert.equal(result.title, "수업 문의");
  assert.equal(result.hidden, false);
  assert.equal(result.replies.length, 1, "공개 질문의 답변은 로그인 없이도 보여야 합니다.");
});
