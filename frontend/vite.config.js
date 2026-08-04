// 파일 역할: Vite 개발 서버와 React 플러그인 설정을 정의합니다.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  define: {
    __NATIVE_APP_BUILD__: JSON.stringify(mode === "app"),
  },
  plugins: [
    react(),
    {
      name: "native-reader-app-html",
      transformIndexHtml(html) {
        if (mode !== "app") return html;
        return html.replace(/\s*<script\s+src=["']\/payment-config\.js["']><\/script>/i, "");
      },
    },
  ],
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
}));
