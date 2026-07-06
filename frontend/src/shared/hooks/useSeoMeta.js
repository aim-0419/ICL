// 파일 역할: 페이지별 title, description, OG 태그를 동적으로 업데이트하는 커스텀 훅입니다.
import { useEffect } from "react";

const DEFAULT_TITLE = "이끌림 필라테스 | 광주 필라테스 스튜디오 & 교육 영상";
const DEFAULT_DESCRIPTION =
  "광주 필라테스 스튜디오 이끌림 필라테스. 장덕점·효천점 운영, 재활과 움직임 교육을 기반으로 개인 맞춤 수업과 전문 교육 영상을 제공합니다.";

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute("content", content);
}

// 함수 역할: 현재 페이지의 title, description, OG 태그를 갱신하고, 언마운트 때 기본값으로 복원합니다.
export function useSeoMeta({ title, description } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | 이끌림 필라테스` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESCRIPTION;

    document.title = fullTitle;
    setMetaContent('meta[name="description"]', desc);
    setMetaContent('meta[property="og:title"]', fullTitle);
    setMetaContent('meta[property="og:description"]', desc);

    return () => {
      document.title = DEFAULT_TITLE;
      setMetaContent('meta[name="description"]', DEFAULT_DESCRIPTION);
      setMetaContent('meta[property="og:title"]', DEFAULT_TITLE);
      setMetaContent('meta[property="og:description"]', DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
