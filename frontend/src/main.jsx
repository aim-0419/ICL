// 애플리케이션 진입점:
// 라우터(BrowserRouter)와 전역 상태(AppProvider)를 루트에 연결합니다.
import React from "react";
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
