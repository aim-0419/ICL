import assert from "node:assert/strict";
import test from "node:test";

import { validateDevelopmentCredentials } from "../scripts/seed-development-accounts.mjs";

const validCredentials = {
  adminLoginId: "dev_admin_example",
  adminPassword: "Example-Admin-123!",
  memberLoginId: "dev_member_example",
  memberPassword: "Example-Member-123!",
};

test("development account credentials accept distinct strong test accounts", () => {
  assert.deepEqual(validateDevelopmentCredentials(validCredentials), []);
});

test("development account credentials reject weak passwords and duplicate IDs", () => {
  const errors = validateDevelopmentCredentials({
    ...validCredentials,
    adminLoginId: "same_login",
    memberLoginId: "same_login",
    adminPassword: "weak",
  });

  assert.ok(errors.includes("development login IDs must be different"));
  assert.ok(errors.includes("development admin password is too weak"));
});
