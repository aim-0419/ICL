import * as ordersService from "./orders.service.js";

export async function getOrders(req, res, next) {
  try {
    const customerEmail = String(req.query.email || "").trim();
    if (customerEmail) {
      res.json(await ordersService.listOrdersByCustomerEmail(customerEmail));
      return;
    }

    res.json(await ordersService.listOrders());
  } catch (error) {
    next(error);
  }
}

export async function createOrder(req, res, next) {
  try {
    res.status(201).json(await ordersService.createOrder(req.body));
  } catch (error) {
    next(error);
  }
}
