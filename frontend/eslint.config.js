// ESLint flat config (ESLint 9). package.json 이 "type": "module" 이라 ESM 으로 쓴다.
//
// 방침: 기존 코드 190개 파일에 처음 붙이는 린터다. 규칙을 세게 걸면 수백 건이
// 한꺼번에 터져 아무도 안 보게 된다. 그래서 "고쳐야 진짜 버그"인 것만 error 로 두고
// 스타일은 전부 prettier 에 맡긴다. 팀이 익숙해지면 단계적으로 올린다.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "dist-app/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "public/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        // vite.config.js 의 define 으로 주입되는 빌드 상수
        __NATIVE_APP_BUILD__: "readonly",
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      // React 17+ 는 JSX 에 import React 가 필요 없다
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // 훅 규칙은 어기면 실제로 깨진다 — 유일하게 세게 건다
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // 오타·죽은 코드류
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",

      // 처음 도입이라 스타일성 규칙은 warn 으로 시작한다. 기존 코드 13건이
      // error 로 잡히면 lint 가 CI 를 막아 아무도 안 켜게 된다.
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-extra-boolean-cast": "warn",

      // 배포 전에 지워야 할 것들
      "no-debugger": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // 테스트·설정 파일은 완화
    files: ["e2e/**", "scripts/**", "*.config.js", "**/*.mjs"],
    rules: { "no-console": "off" },
  },
];
