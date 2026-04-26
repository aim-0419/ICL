// 파일 역할: React 앱을 브라우저 DOM에 연결하고 라우터와 전역 스토어를 감쌉니다.
// 애플리케이션 진입점:
// 라우터(BrowserRouter)와 전역 상태(AppProvider)를 루트에 연결합니다.
import React from "react";
// 프론트엔드 애플리케이션의 진입점이다.
// 라우터와 전역 상태 저장소를 루트 컴포넌트에 연결해 전체 화면에서 공통으로 사용한다.
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App.jsx";
import "../styles.css";
import { AppProvider } from "./shared/store/AppContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
