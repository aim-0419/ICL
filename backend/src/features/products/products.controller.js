import * as productsService from "./products.service.js";

export async function getProducts(req, res, next) {
  try {
    res.json(await productsService.listProducts());
  } catch (error) {
    next(error);
  }
}
