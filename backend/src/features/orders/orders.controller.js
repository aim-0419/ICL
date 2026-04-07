import * as ordersService from "./orders.service.js";

export function getOrders(req, res) {
  res.json(ordersService.listOrders());
}

export function createOrder(req, res) {
  res.status(201).json(ordersService.createOrder(req.body));
}
