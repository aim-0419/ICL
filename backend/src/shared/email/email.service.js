// 파일 역할: nodemailer를 통해 이메일을 발송하는 공통 서비스입니다.
import nodemailer from "nodemailer";
import { env } from "../../config/env.js";

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) return null;

  _transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
  return _transporter;
}

// 함수 역할: 이메일을 발송합니다. SMTP 설정이 없으면 로그만 남기고 건너뜁니다.
export async function sendEmail(to, subject, html) {
  if (!to) return;
  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP 미설정 — 발송 건너뜀:", subject, "→", to);
    return;
  }
  try {
    await t.sendMail({ from: env.smtpFrom, to, subject, html });
    console.info("[email] 발송 완료:", subject, "→", to);
  } catch (err) {
    console.error("[email] 발송 실패:", err.message);
  }
}

// 이메일 공통 레이아웃 래퍼
function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { margin:0; padding:0; background:#f5f1eb; font-family:'Apple SD Gothic Neo',sans-serif; color:#2c2c2c; }
  .wrap { max-width:560px; margin:32px auto; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .header { background:#2c2c2c; padding:28px 32px; text-align:center; }
  .header h1 { margin:0; font-size:18px; color:#e8d5b0; letter-spacing:.5px; }
  .body { padding:32px 36px; }
  .body h2 { font-size:17px; margin:0 0 16px; }
  .body p { font-size:14px; line-height:1.75; color:#444; margin:0 0 12px; }
  .box { background:#f9f6f1; border-radius:10px; padding:20px 24px; margin:20px 0; }
  .box p { margin:6px 0; font-size:14px; }
  .box strong { color:#2c2c2c; }
  .code { font-size:32px; font-weight:700; letter-spacing:8px; color:#2c2c2c; text-align:center; padding:16px 0; }
  .btn { display:block; width:fit-content; margin:24px auto 0; background:#2c2c2c; color:#fff; text-decoration:none; padding:12px 32px; border-radius:30px; font-size:14px; font-weight:600; }
  .footer { background:#f5f1eb; padding:20px 32px; text-align:center; font-size:12px; color:#888; }
  .divider { height:1px; background:#eee; margin:20px 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>이끌림 필라테스</h1></div>
  <div class="body">
    <h2>${title}</h2>
    ${bodyHtml}
  </div>
  <div class="footer">
    본 메일은 발신 전용입니다. 문의는 홈페이지를 이용해 주세요.<br />
    © 이끌림 필라테스. All rights reserved.
  </div>
</div>
</body>
</html>`;
}

// 함수 역할: 이메일 인증번호를 발송합니다.
export async function sendEmailVerificationCode(email, code, expiresMinutes = 5) {
  const subject = "[이끌림 필라테스] 이메일 인증번호";
  const html = wrapHtml(
    "이메일 인증번호 안내",
    `<p>아래 인증번호를 입력해 이메일 인증을 완료해 주세요.</p>
    <div class="code">${code}</div>
    <p style="text-align:center;font-size:13px;color:#888;">인증번호는 <strong>${expiresMinutes}분</strong> 동안 유효합니다.</p>
    <div class="divider"></div>
    <p style="font-size:13px;color:#aaa;">본인이 요청하지 않은 경우 이 메일을 무시해 주세요.</p>`
  );
  await sendEmail(email, subject, html);
}

// 함수 역할: 구매 완료 확인 이메일을 발송합니다.
export async function sendPurchaseConfirmation(order) {
  const email = String(order?.customerEmail || "").trim();
  if (!email) return;

  const orderName = String(order?.orderName || "주문").trim();
  const amount = Number(order?.amount || 0).toLocaleString("ko-KR");
  const orderId = String(order?.id || order?.orderId || "").trim();
  const purchasedAt = new Date().toLocaleString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const subject = `[이끌림 필라테스] 구매가 완료되었습니다 — ${orderName}`;
  const html = wrapHtml(
    "구매 완료 안내",
    `<p>안녕하세요! 구매해 주셔서 감사합니다.<br />주문 내역을 아래에서 확인하세요.</p>
    <div class="box">
      <p><strong>주문명</strong> : ${orderName}</p>
      <p><strong>결제 금액</strong> : ${amount}원</p>
      <p><strong>결제 일시</strong> : ${purchasedAt}</p>
      ${orderId ? `<p><strong>주문 번호</strong> : ${orderId}</p>` : ""}
    </div>
    <p>마이페이지에서 수강을 시작하실 수 있습니다.</p>
    <a class="btn" href="${env.siteUrl || ""}/mypage">마이페이지로 이동</a>`
  );
  await sendEmail(email, subject, html);
}

// 함수 역할: Q&A 답변 등록 알림 이메일을 발송합니다.
export async function sendQnaReplyNotification({ toEmail, videoId, postTitle, replyContent }) {
  const email = String(toEmail || "").trim();
  if (!email) return;

  const subject = "[이끌림 필라테스] Q&A에 답변이 등록되었습니다";
  const previewContent = String(replyContent || "")
    .slice(0, 200)
    .replace(/\n/g, "<br />");
  const pageUrl = videoId
    ? `${env.siteUrl || ""}/academy/${videoId}`
    : `${env.siteUrl || ""}/academy`;

  const html = wrapHtml(
    "Q&A 답변 안내",
    `<p>질문하신 내용에 관리자 답변이 등록되었습니다.</p>
    <div class="box">
      <p><strong>질문 제목</strong> : ${postTitle}</p>
      <div class="divider"></div>
      <p style="color:#555;">${previewContent}${replyContent?.length > 200 ? "..." : ""}</p>
    </div>
    <a class="btn" href="${pageUrl}">강의 페이지에서 확인하기</a>`
  );
  await sendEmail(email, subject, html);
}

// 함수 역할: 문의 답변 등록 알림 이메일을 발송합니다.
export async function sendInquiryReplyNotification({ toEmail, inquiryTitle, replyContent }) {
  const email = String(toEmail || "").trim();
  if (!email) return;

  const subject = "[이끌림 필라테스] 문의하신 내용에 답변이 등록되었습니다";
  const previewContent = String(replyContent || "")
    .slice(0, 200)
    .replace(/\n/g, "<br />");

  const html = wrapHtml(
    "문의 답변 안내",
    `<p>문의하신 내용에 관리자 답변이 등록되었습니다.</p>
    <div class="box">
      <p><strong>문의 제목</strong> : ${inquiryTitle}</p>
      <div class="divider"></div>
      <p style="color:#555;">${previewContent}${replyContent?.length > 200 ? "..." : ""}</p>
    </div>
    <a class="btn" href="${env.siteUrl || ""}/community/inquiry">문의 내용 확인하기</a>`
  );
  await sendEmail(email, subject, html);
}
