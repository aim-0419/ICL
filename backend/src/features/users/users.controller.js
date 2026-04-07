import * as usersService from "./users.service.js";

export function getUsers(req, res) {
  res.json(usersService.listUsers());
}
