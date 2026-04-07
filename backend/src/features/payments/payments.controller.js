import * as paymentsService from "./payments.service.js";

export function confirm(req, res) {
  res.json(paymentsService.confirmPayment(req.body));
}
