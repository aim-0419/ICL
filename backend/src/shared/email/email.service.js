// 파일 역할: nodemailer를 통해 이메일을 발송하는 공통 서비스입니다.
import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { query } from "../db/mysql.js";

let _transporter = null;

function maskEmailAddress(value) {
  const email = String(value || "").trim().toLowerCase();
  const [local, domain] = email.split("@");
  if (!local || !domain) return "";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

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
function canSendExternalEmail() {
  return !env.testSafeMode && env.allowExternalEmailSend;
}

export async function sendEmail(to, subject, html) {
  if (!to) return { sent: false, skipped: true, reason: "NO_RECIPIENT" };
  if (!canSendExternalEmail()) {
    console.info("[email] send skipped by safety settings:", subject);
    return { sent: false, skipped: true, reason: "EMAIL_SEND_DISABLED" };
  }

  const t = getTransporter();
  if (!t) {
    console.warn("[email] SMTP 미설정 - 발송 건너뜀:", subject, "->", maskEmailAddress(to));
    return { sent: false, skipped: true, reason: "SMTP_NOT_CONFIGURED" };
  }
  try {
    await t.sendMail({ from: env.smtpFrom, to, subject, html });
    console.info("[email] 발송 완료:", subject, "->", maskEmailAddress(to));
    return { sent: true, skipped: false };
  } catch (err) {
    console.error("[email] 발송 실패:", err.message);
    return { sent: false, skipped: false, reason: "DELIVERY_FAILED" };
  }
}

// 결제 수단 한글 라벨 변환
function resolvePaymentMethodLabel(method) {
  const map = {
    tosspay: "토스페이",
    kakaopay: "카카오페이",
    naverpay: "네이버페이",
    card: "신용/체크카드",
    trans: "계좌이체",
    vbank: "가상계좌",
    phone: "휴대폰 소액결제",
    cultureland: "문화상품권",
    smartculture: "스마트문화상품권",
    booknlife: "도서문화상품권",
  };
  return map[String(method).toLowerCase()] || String(method) || "기타";
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
  .table-wrap { width:100%; border-collapse:collapse; margin:12px 0; }
  .table-wrap th { text-align:left; padding:8px 0; border-bottom:2px solid #2c2c2c; font-size:13px; color:#2c2c2c; }
  .table-wrap th.right { text-align:right; }
  .table-wrap td { padding:10px 0; border-bottom:1px solid #eee; font-size:14px; color:#444; vertical-align:top; }
  .table-wrap td.right { text-align:right; white-space:nowrap; }
  .table-wrap tr:last-child td { border-bottom:none; }
  .summary-row { display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:14px; color:#555; }
  .summary-row.discount { color:#c0392b; }
  .summary-row.total { border-top:2px solid #2c2c2c; margin-top:8px; padding-top:12px; font-size:16px; font-weight:700; color:#2c2c2c; }
  .code { font-size:32px; font-weight:700; letter-spacing:8px; color:#2c2c2c; text-align:center; padding:16px 0; }
  .btn { display:block; width:fit-content; margin:24px auto 0; background:#2c2c2c; color:#fff; text-decoration:none; padding:12px 32px; border-radius:30px; font-size:14px; font-weight:600; }
  .footer { background:#f5f1eb; padding:20px 32px; text-align:center; font-size:12px; color:#888; }
  .divider { height:1px; background:#eee; margin:20px 0; }
  .badge { display:inline-block; background:#e8f5e9; color:#2e7d32; border-radius:20px; padding:3px 12px; font-size:12px; font-weight:600; }
  .order-no { font-size:12px; color:#999; margin-top:4px; }
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
    `<p>안녕하세요!<br />이끌림 필라테스 회원가입을 위한 이메일 인증번호를 안내해 드립니다.</p>
    <p>아래 6자리 인증번호를 인증 화면에 입력해 주세요.</p>
    <div class="code">${code}</div>
    <div class="box" style="text-align:center;margin-top:0;">
      <p style="margin:0;font-size:13px;color:#888;">
        ⏱ 인증번호 유효 시간 &nbsp;<strong style="color:#2c2c2c;">${expiresMinutes}분</strong>
      </p>
    </div>
    <div class="divider"></div>
    <p style="font-size:13px;color:#aaa;line-height:1.8;">
      · 인증번호는 타인에게 절대 공유하지 마세요.<br />
      · 본인이 요청하지 않은 경우 이 메일을 무시하셔도 됩니다.<br />
      · 인증번호가 만료된 경우 다시 요청해 주세요.
    </p>`
  );
  const result = await sendEmail(email, subject, html);
  if (!result?.sent) {
    const error = new Error("인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    error.status = 503;
    error.code = "EMAIL_DELIVERY_UNAVAILABLE";
    error.expose = true;
    throw error;
  }
  return result;
}

// 함수 역할: 구매 완료 확인 이메일을 발송합니다.
export async function sendPurchaseConfirmation(order) {
  const email = String(order?.customerEmail || "").trim();
  if (!email) return;

  const orderId = String(order?.id || order?.orderId || "").trim();
  const orderName = String(order?.orderName || "주문").trim();
  const amount = Number(order?.amount || 0);
  const discountPoint = Number(order?.discountPoint || 0);
  const originalAmount = amount + discountPoint;
  const customerName = String(order?.customerName || "고객님").trim();
  const paymentMethodLabel = resolvePaymentMethodLabel(String(order?.paymentMethod || ""));
  const purchasedAt = new Date(order?.createdAt || Date.now()).toLocaleString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // 구매 상품 목록 조회
  let productRows = [];
  const productIds = Array.isArray(order?.selectedProductIds) ? order.selectedProductIds : [];
  if (productIds.length > 0) {
    try {
      const placeholders = productIds.map(() => "?").join(", ");
      productRows = await query(
        `SELECT p.id, p.name, p.price
         FROM products p
         WHERE p.id IN (${placeholders})`,
        productIds
      );
    } catch (err) {
      console.warn("[email] 상품 목록 조회 실패:", err.message);
    }
  }

  // 상품 목록 HTML
  let productTableHtml = "";
  if (productRows.length > 0) {
    const rows = productRows
      .map(
        (p) =>
          `<tr>
            <td>${String(p.name || orderName)}</td>
            <td class="right">${Number(p.price || 0).toLocaleString("ko-KR")}원</td>
          </tr>`
      )
      .join("");
    productTableHtml = `
      <table class="table-wrap">
        <thead>
          <tr>
            <th>커리큘럼</th>
            <th class="right">금액</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  } else {
    productTableHtml = `
      <table class="table-wrap">
        <thead>
          <tr><th>커리큘럼</th><th class="right">금액</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${orderName}</td>
            <td class="right">${originalAmount.toLocaleString("ko-KR")}원</td>
          </tr>
        </tbody>
      </table>`;
  }

  // 금액 요약 HTML
  const amountSummaryHtml = `
    <div style="margin-top:16px;">
      <div class="summary-row">
        <span>상품 금액</span>
        <span>${originalAmount.toLocaleString("ko-KR")}원</span>
      </div>
      ${
        discountPoint > 0
          ? `<div class="summary-row discount">
              <span>포인트 할인</span>
              <span>− ${discountPoint.toLocaleString("ko-KR")}원</span>
            </div>`
          : ""
      }
      <div class="summary-row total">
        <span>최종 결제 금액</span>
        <span>${amount.toLocaleString("ko-KR")}원</span>
      </div>
    </div>`;

  const subject = `[이끌림 필라테스] 구매가 완료되었습니다 — ${orderName}`;
  const html = wrapHtml(
    "구매 완료 안내",
    `<p><strong>${customerName}</strong>님, 구매해 주셔서 감사합니다!<br />
    아래에서 구매 내역을 확인하세요.</p>

    <div class="box">
      <p style="margin-bottom:12px;"><span class="badge">결제 완료</span></p>
      <p><strong>주문번호</strong></p>
      <p class="order-no">${orderId}</p>
      <div class="divider"></div>
      ${productTableHtml}
      ${amountSummaryHtml}
      <div class="divider"></div>
      <p><strong>결제 수단</strong> &nbsp; ${paymentMethodLabel}</p>
      <p><strong>결제 일시</strong> &nbsp; ${purchasedAt}</p>
    </div>

    <p style="font-size:13px;color:#888;">마이페이지에서 수강을 시작하실 수 있습니다.<br />
    결제 관련 문의는 홈페이지 고객센터를 이용해 주세요.</p>
    <a class="btn" href="${env.siteUrl || ""}/mypage">마이페이지에서 수강 시작하기</a>`
  );
  await sendEmail(email, subject, html);
}

// 함수 역할: Q&A 답변 등록 알림 이메일을 발송합니다.
export async function sendQnaReplyNotification({ toEmail, userName, videoId, videoTitle, postTitle, replyContent }) {
  const email = String(toEmail || "").trim();
  if (!email) return;

  const greeting = userName ? `<strong>${String(userName)}님</strong>, ` : "";
  const safePostTitle = String(postTitle || "질문").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeVideoTitle = String(videoTitle || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const previewContent = String(replyContent || "")
    .slice(0, 400)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
  const pageUrl = videoId
    ? `${env.siteUrl || ""}/academy/${videoId}`
    : `${env.siteUrl || ""}/academy`;

  const subject = "[이끌림 필라테스] Q&A에 답변이 등록되었습니다";
  const html = wrapHtml(
    "Q&A 답변 안내",
    `<p>${greeting}질문하신 내용에 관리자 답변이 등록되었습니다.</p>

    <div class="box">
      ${safeVideoTitle ? `<p style="font-size:12px;color:#999;margin-bottom:4px;">강의</p>
      <p style="font-size:14px;color:#555;margin-bottom:16px;">${safeVideoTitle}</p>
      <div class="divider" style="margin:12px 0;"></div>` : ""}
      <p style="font-size:12px;color:#999;margin-bottom:4px;">질문 제목</p>
      <p style="font-size:15px;font-weight:600;color:#2c2c2c;margin-bottom:0;">${safePostTitle}</p>
    </div>

    <div class="box" style="margin-top:0;">
      <p style="font-size:12px;color:#999;margin-bottom:8px;">관리자 답변</p>
      <p style="line-height:1.85;color:#333;margin:0;">${previewContent}${
        (replyContent?.length || 0) > 400
          ? '<br /><br /><em style="color:#aaa;font-size:13px;">— 전체 내용은 강의 페이지에서 확인하세요.</em>'
          : ""
      }</p>
    </div>

    <a class="btn" href="${pageUrl}">강의 페이지에서 확인하기</a>`
  );
  await sendEmail(email, subject, html);
}

// 함수 역할: 문의 답변 등록 알림 이메일을 발송합니다.
export async function sendInquiryReplyNotification({ toEmail, userName, inquiryTitle, inquiryContent, inquiryDate, replyContent }) {
  const email = String(toEmail || "").trim();
  if (!email) return;

  const greeting = userName ? `<strong>${String(userName)}님</strong>, ` : "";
  const safeTitle = String(inquiryTitle || "문의").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeInquiryContent = String(inquiryContent || "")
    .slice(0, 200)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
  const previewReply = String(replyContent || "")
    .slice(0, 400)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
  const formattedDate = inquiryDate
    ? new Date(inquiryDate).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const subject = "[이끌림 필라테스] 문의하신 내용에 답변이 등록되었습니다";
  const html = wrapHtml(
    "문의 답변 안내",
    `<p>${greeting}문의하신 내용에 관리자 답변이 등록되었습니다.</p>

    <div class="box">
      <p style="font-size:12px;color:#999;margin-bottom:4px;">문의 제목</p>
      <p style="font-size:15px;font-weight:600;color:#2c2c2c;margin-bottom:0;">${safeTitle}</p>
      ${formattedDate ? `<p style="font-size:12px;color:#bbb;margin-top:6px;margin-bottom:0;">문의 일자 &nbsp; ${formattedDate}</p>` : ""}
      ${safeInquiryContent ? `<div class="divider" style="margin:12px 0;"></div>
      <p style="font-size:12px;color:#999;margin-bottom:6px;">문의 내용 요약</p>
      <p style="font-size:13px;color:#777;line-height:1.75;margin:0;">${safeInquiryContent}${(inquiryContent?.length || 0) > 200 ? " …" : ""}</p>` : ""}
    </div>

    <div class="box" style="margin-top:0;">
      <p style="font-size:12px;color:#999;margin-bottom:8px;">관리자 답변</p>
      <p style="line-height:1.85;color:#333;margin:0;">${previewReply}${
        (replyContent?.length || 0) > 400
          ? '<br /><br /><em style="color:#aaa;font-size:13px;">— 전체 내용은 문의 페이지에서 확인하세요.</em>'
          : ""
      }</p>
    </div>

    <a class="btn" href="${env.siteUrl || ""}/community/inquiry">문의 페이지에서 전체 확인하기</a>`
  );
  await sendEmail(email, subject, html);
}
