import * as paymentsService from "./payments.service.js";

export async function confirm(req, res, next) {
  try {
    const result = await paymentsService.confirmPayment(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
