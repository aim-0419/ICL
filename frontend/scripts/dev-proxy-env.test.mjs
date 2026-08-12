import assert from "node:assert/strict";
import test from "node:test";

import { resolveDevelopmentProxyTarget } from "./dev-proxy-env.mjs";

test("development web defaults to the isolated local backend", () => {
  assert.equal(resolveDevelopmentProxyTarget({}), "http://127.0.0.1:4001");
});

test("development web rejects a production API host", () => {
  assert.throws(
    () => resolveDevelopmentProxyTarget({ VITE_DEV_API_PROXY_TARGET: "https://icl-pilates.com" }),
    /not in VITE_DEV_API_ALLOWED_HOSTS/,
  );
});

test("development web accepts an explicitly approved development host", () => {
  assert.equal(
    resolveDevelopmentProxyTarget({
      VITE_DEV_API_PROXY_TARGET: "https://dev.icl.example/api/",
      VITE_DEV_API_ALLOWED_HOSTS: "localhost,dev.icl.example",
    }),
    "https://dev.icl.example/api",
  );
});
