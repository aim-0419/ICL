// 파일 역할: Vite 개발 서버와 React 플러그인 설정을 정의합니다.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "https://icl-pilates.com",
        changeOrigin: true,
      },
      "/uploads": {
        target: "https://icl-pilates.com",
        changeOrigin: true,
      },
    },
  },
});
