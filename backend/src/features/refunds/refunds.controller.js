// 파일 역할: 환불 API 요청을 검증하고 서비스 호출 결과를 HTTP 응답으로 변환합니다.
import * as refundsService from "./refunds.service.js";
import { resolveSessionUser, isAdminUser } from "../../shared/middlewares/auth.js";

// 함수 역할: requestRefund 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function requestRefund(req, res, next) {
  try {
    const authUser = await resolveSessionUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const result = await refundsService.createRefundRequest({
      userId: authUser.id,
      customerEmail: authUser.email || "",
      orderId: String(req.body?.orderId || "").trim(),
      selectedProductIds: req.body?.selectedProductIds,
      requestedAmount: req.body?.requestedAmount,
      reason: req.body?.reason,
    });

    res.status(201).json({
      message: "환불 신청이 접수되었습니다.",
      refundRequest: result,
    });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: my 환불 requests 데이터를 조회해 호출자에게 반환합니다.
export async function getMyRefundRequests(req, res, next) {
  try {
    const authUser = await resolveSessionUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    const requests = await refundsService.listMyRefundRequests(authUser.id);
    res.json({ requests });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: adminListRefundRequests 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function adminListRefundRequests(req, res, next) {
  try {
    const authUser = await resolveSessionUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const status = String(req.query.status || "").trim();
    const requests = await refundsService.listAllRefundRequests({ status });
    res.json({ requests });
  } catch (error) {
    next(error);
  }
}

// 함수 역할: adminApproveRefundRequest 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function adminApproveRefundRequest(req, res, next) {
  try {
    const authUser = await resolveSessionUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const requestId = String(req.params.requestId || "").trim();
    const result = await refundsService.approveRefundRequest(requestId, {
      adminNote: req.body?.adminNote,
      approvedAmount: req.body?.approvedAmount,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// 함수 역할: adminRejectRefundRequest 함수는 이 파일의 기능 흐름 중 하나를 담당합니다.
export async function adminRejectRefundRequest(req, res, next) {
  try {
    const authUser = await resolveSessionUser(req);
    if (!authUser?.id) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (!isAdminUser(authUser)) {
      res.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }

    const requestId = String(req.params.requestId || "").trim();
    const result = await refundsService.rejectRefundRequest(requestId, {
      adminNote: req.body?.adminNote,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}
