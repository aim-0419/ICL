import { useEffect, useState } from "react";

function getDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** 자정이 지나면 앱을 다시 렌더링해 오늘 표시와 날짜 필터를 자동 갱신합니다. */
export function useMidnightRefresh() {
  const [, setDateKey] = useState(getDateKey);

  useEffect(() => {
    let timerId;
    const schedule = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timerId = window.setTimeout(() => {
        setDateKey(getDateKey());
        window.dispatchEvent(new CustomEvent("app-date-changed", { detail: { date: getDateKey() } }));
        schedule();
      }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    };
    schedule();
    return () => window.clearTimeout(timerId);
  }, []);
}
