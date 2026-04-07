import * as authService from "./auth.service.js";

export function signup(req, res, next) {
  try {
    const result = authService.signup(req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export function login(req, res, next) {
  try {
    const result = authService.login(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  res.json({ ok: true });
}
