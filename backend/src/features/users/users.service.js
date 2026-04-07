import { db } from "../../shared/data/in-memory-db.js";

export function listUsers() {
  return db.users.map((user) => ({ ...user, password: undefined }));
}
