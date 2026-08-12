import assert from "node:assert/strict";
import test from "node:test";

import { validateAppEnvironment } from "./app-env.mjs";

const productionHosts = "icl-pilates.com,www.icl-pilates.com";

test("development native build accepts an explicitly allowed local API", () => {
  const errors = validateAppEnvironment({
    VITE_APP_SHELL: "native",
    VITE_APP_ENV: "development",
    VITE_API_BASE_URL: "http://localhost:4001/api",
    APP_BUILD_ALLOW_LOCAL: "true",
    VITE_PRODUCTION_API_HOSTS: productionHosts,
  }, "development");
  assert.deepEqual(errors, []);
});

test("development native build rejects the production API", () => {
  const errors = validateAppEnvironment({
    VITE_APP_SHELL: "native",
    VITE_APP_ENV: "development",
    VITE_API_BASE_URL: "https://icl-pilates.com/api",
    APP_BUILD_ALLOW_LOCAL: "true",
    VITE_PRODUCTION_API_HOSTS: productionHosts,
  }, "development");
  assert.ok(errors.some((error) => error.includes("production API")));
});

test("production native build requires the approved HTTPS host", () => {
  const errors = validateAppEnvironment({
    VITE_APP_SHELL: "native",
    VITE_APP_ENV: "production",
    VITE_API_BASE_URL: "https://icl-pilates.com/api",
    APP_BUILD_ALLOW_LOCAL: "false",
    VITE_APP_LINK_HOSTS: productionHosts,
    VITE_PRODUCTION_API_HOSTS: productionHosts,
  }, "production");
  assert.deepEqual(errors, []);
});

test("production native build rejects local and mismatched environments", () => {
  const errors = validateAppEnvironment({
    VITE_APP_SHELL: "native",
    VITE_APP_ENV: "development",
    VITE_API_BASE_URL: "http://localhost:4001/api",
    APP_BUILD_ALLOW_LOCAL: "true",
    VITE_APP_LINK_HOSTS: productionHosts,
  }, "production");
  assert.ok(errors.length >= 3);
});
