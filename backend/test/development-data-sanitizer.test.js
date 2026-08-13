import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSanitizedDataset,
  createSanitizationContext,
  sanitizeTableRows,
  serializeSanitizedDatabaseValue,
} from "../scripts/development-data-sanitizer.mjs";

function context() {
  const result = createSanitizationContext({ secret: Buffer.alloc(32, 7) });
  result.disabledPasswordHash = "scrypt$v1$disabled$hash";
  return result;
}

test("users are pseudonymized while roles and relationship-safe fields remain", () => {
  const rows = sanitizeTableRows("users", [{
    id: "real-admin-id",
    login_id: "real-login",
    name: "Real Name",
    email: "real@example.com",
    email_hash: "real-hash",
    password: "real-password-hash",
    phone: "010-1234-5678",
    phone_hash: "phone-hash",
    birth_year_encrypted: "enc:v1:secret",
    role: "admin",
    is_admin: 1,
  }], context());

  assert.equal(rows.length, 1);
  assert.match(rows[0].id, /^dev-user-/);
  assert.match(rows[0].email, /@example\.invalid$/);
  assert.equal(rows[0].email_hash, null);
  assert.equal(rows[0].phone, null);
  assert.equal(rows[0].role, "admin");
  assert.equal(rows[0].is_admin, 1);
  assert.notEqual(rows[0].login_id, "real-login");
  assert.notEqual(rows[0].password, "real-password-hash");
});

test("sessions, notification deliveries, payment confirmations, and member memos are cleared", () => {
  for (const table of ["sessions", "studio_notification_deliveries", "payment_confirmations", "studio_member_memos"]) {
    assert.deepEqual(sanitizeTableRows(table, [{ id: "sensitive" }], context()), []);
  }
});

test("orders preserve structure but remove customer and payment identifiers", () => {
  const [row] = sanitizeTableRows("orders", [{
    id: "real-order",
    order_name: "Real customer order",
    customer_email: "real@example.com",
    customer_email_hash: "hash",
    payload: JSON.stringify({
      orderId: "real-order",
      customerName: "Real Name",
      customerPhone: "010-1234-5678",
      paymentId: "real-payment",
      amount: 50000,
      selectedProductIds: ["product-1"],
    }),
  }], context());
  const payload = JSON.parse(row.payload);

  assert.match(row.id, /^dev-order-/);
  assert.match(row.customer_email, /@example\.invalid$/);
  assert.equal(row.customer_email_hash, null);
  assert.notEqual(payload.customerName, "Real Name");
  assert.notEqual(payload.customerPhone, "010-1234-5678");
  assert.equal(payload.paymentId, "[REDACTED]");
  assert.equal(payload.amount, 50000);
  assert.deepEqual(payload.selectedProductIds, ["product-1"]);
});

test("dataset validation rejects encrypted PII and non-development email addresses", () => {
  const base = { version: 1, kind: "icl-development-sanitized-data", tables: [{ table: "users", columns: ["email"], rows: [] }] };
  assert.equal(assertSanitizedDataset(base), true);
  assert.throws(() => assertSanitizedDataset({ ...base, note: "enc:v1:secret" }), /encrypted PII/);
  assert.throws(() => assertSanitizedDataset({ ...base, note: "person@real-domain.com" }), /non-development email/);
});

test("structured database values are serialized without expanding SQL placeholders", () => {
  assert.equal(serializeSanitizedDatabaseValue(["video-3", "video-5"]), '["video-3","video-5"]');
  assert.equal(serializeSanitizedDatabaseValue({ enabled: false }), '{"enabled":false}');
  assert.equal(serializeSanitizedDatabaseValue("plain"), "plain");
  assert.equal(serializeSanitizedDatabaseValue(null), null);
});
