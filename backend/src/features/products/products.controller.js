import * as productsService from "./products.service.js";

export function getProducts(req, res) {
  res.json(productsService.listProducts());
}
