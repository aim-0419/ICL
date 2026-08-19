// 파일 역할: 운동 시작 전 건강 상태 확인을 안내하는 공통 고지 문구입니다.
//
// 스토어 심사에서 운동·피트니스 앱은 의료 주장을 하지 않는 것과 별개로
// 사용자에게 안전 고지를 제공하는지를 봅니다. 수업 예약과 영상 수강처럼
// 실제로 몸을 움직이는 진입점마다 같은 문구가 보이도록 한 곳에 둡니다.
import React from "react";

export function ExerciseSafetyNotice({ className = "" }) {
  return (
    <p className={`exercise-safety-notice ${className}`.trim()} role="note">
      본 서비스는 의료 행위나 치료를 제공하지 않습니다. 통증이 있거나 질환·부상이 있는 경우,
      임신 중이거나 수술 이력이 있는 경우에는 운동을 시작하기 전에 의사와 상담해 주세요.
      운동 중 통증이나 이상 증상이 느껴지면 즉시 중단하시기 바랍니다.
    </p>
  );
}
