import { db } from "../../shared/data/in-memory-db.js";

function createSession(userId) {
  const token = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  db.sessions.push({ token, userId, createdAt: new Date().toISOString() });
  return token;
}

export function signup(payload) {
  const exists = db.users.some((user) => user.email === payload.email);
  if (exists) {
    const error = new Error("이미 가입된 이메일입니다.");
    error.status = 409;
    throw error;
  }

  const user = {
    id: `user-${Date.now()}`,
    name: payload.name,
    email: payload.email,
    password: payload.password,
    phone: payload.phone,
    createdAt: new Date().toISOString(),
  };

  db.users.push(user);
  const token = createSession(user.id);

  return { user: { ...user, password: undefined }, token };
}

export function login(payload) {
  const user = db.users.find(
    (item) => item.email === payload.email && item.password === payload.password
  );

  if (!user) {
    const error = new Error("이메일 또는 비밀번호를 확인해주세요.");
    error.status = 401;
    throw error;
  }

  const token = createSession(user.id);
  return { user: { ...user, password: undefined }, token };
}
