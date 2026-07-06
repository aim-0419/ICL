/**
 * [회원가입 페이지]
 *
 * 새로운 회원이 아이디·이름·이메일·비밀번호를 입력하고 약관에 동의한 뒤 가입하는 화면입니다.
 * - 이메일 인증 코드를 발송하고 확인하는 단계를 포함합니다
 * - 이용약관·개인정보 처리방침 전문을 모달로 확인할 수 있습니다
 * - 가입 완료 후 자동으로 로그인되어 홈 화면으로 이동합니다
 */
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { useAppStore } from "../../../shared/store/AppContext.jsx";
import { apiRequest } from "../../../shared/api/client.js";

const TERMS_CONTENT = {
  service: {
    title: "서비스 이용약관",
    body: `제1조 (목적)

이 약관은 이끌림 필라테스(이하 "회사")가 제공하는 온라인 필라테스 교육 서비스 및 관련 제반 서비스(이하 "서비스")의 이용과 관련하여 회사와 회원의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.

제2조 (정의)

① "서비스"란 회사가 제공하는 온라인 필라테스 강의, 교육 콘텐츠, 커뮤니티, 회원 관리 등 인터넷을 통하여 제공하는 모든 서비스를 의미합니다.

② "회원"이란 본 약관에 동의하고 회원가입을 완료하여 회사가 제공하는 서비스를 이용하는 자를 말합니다.

③ "콘텐츠"란 회사가 서비스에서 제공하는 동영상, 이미지, 텍스트, 음성, PDF 등 모든 교육 자료를 의미합니다.

④ "유료서비스"란 회원이 회사에 이용요금을 지급하고 이용하는 온라인 강의 및 기타 유료 콘텐츠를 의미합니다.

제3조 (약관의 효력 및 변경)

① 본 약관은 회원가입 시 동의함으로써 효력이 발생합니다.

② 회사는 관계 법령을 위반하지 않는 범위에서 본 약관을 변경할 수 있습니다.

③ 약관이 변경되는 경우 시행일 및 변경사유를 시행 7일 전부터 공지합니다.

④ 회원에게 불리한 변경이 있는 경우에는 시행일 30일 이전부터 공지하며 이메일 등을 통해 개별 안내할 수 있습니다.

⑤ 변경된 약관에 동의하지 않는 경우 회원은 이용계약을 해지할 수 있습니다.

제4조 (회원가입 및 이용계약)

① 이용계약은 회원이 본 약관에 동의하고 회원가입을 완료한 후 회사가 이를 승인함으로써 성립합니다.

② 회사는 다음 각 호에 해당하는 경우 회원가입을 거부하거나 사후 이용을 제한할 수 있습니다.

타인의 정보를 도용한 경우
허위 정보를 입력한 경우
관련 법령을 위반한 경우
서비스 운영을 현저히 방해하는 경우

제5조 (서비스의 제공)

① 회사는 연중무휴 24시간 서비스를 제공함을 원칙으로 합니다.

② 다음의 경우 서비스가 일시 중단될 수 있습니다.

시스템 점검
서버 유지보수
장애 발생
천재지변
기타 불가피한 사유

③ 회사는 서비스 내용의 변경 또는 기능 추가를 할 수 있으며 필요한 경우 사전에 공지합니다.

제6조 (회원의 의무)

회원은 다음 행위를 하여서는 안 됩니다.

타인의 개인정보 도용
허위 정보 등록
계정 공유 또는 양도
콘텐츠의 무단 복제·배포·판매
화면 녹화 또는 다운로드를 통한 불법 이용
회사의 서비스 운영을 방해하는 행위
관계 법령을 위반하는 행위

회원은 자신의 아이디와 비밀번호를 안전하게 관리하여야 하며, 그 관리 소홀에 따른 책임은 회원에게 있습니다.

제7조 (유료서비스의 결제 및 환불)

① 유료서비스는 회사가 제공하는 결제수단을 통하여 결제할 수 있습니다.

② 결제가 완료된 시점부터 유료서비스 이용계약이 성립합니다.

③ 회원은 콘텐츠 구매일로부터 7일 이내이며 콘텐츠를 이용하지 않은 경우 전액 환불을 요청할 수 있습니다.

④ 콘텐츠 이용이 시작된 경우에는 「콘텐츠산업진흥법」, 「전자상거래 등에서의 소비자보호에 관한 법률」 및 공정거래위원회 소비자분쟁해결기준에 따라 환불금액을 산정합니다.

⑤ 중복결제 또는 회사의 시스템 오류로 인한 결제는 확인 후 환불합니다.

제8조 (지식재산권)

① 서비스에서 제공되는 모든 콘텐츠의 저작권 및 지식재산권은 회사 또는 정당한 권리를 보유한 자에게 있습니다.

② 회원은 회사의 사전 서면 동의 없이 콘텐츠를 복제, 배포, 전송, 판매, 대여, 수정하거나 상업적으로 이용할 수 없습니다.

제9조 (회원 탈퇴 및 이용제한)

① 회원은 언제든지 마이페이지를 통해 회원탈퇴를 신청할 수 있습니다.

② 회사는 다음 각 호의 경우 회원의 서비스 이용을 제한하거나 회원자격을 상실시킬 수 있습니다.

본 약관을 위반한 경우
불법적인 방법으로 서비스를 이용한 경우
타 회원의 서비스 이용을 방해한 경우
회사의 운영을 방해한 경우

제10조 (면책조항)

① 회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중단 등 불가항력적인 사유로 서비스를 제공할 수 없는 경우 책임을 부담하지 않습니다.

② 회사는 회원의 귀책사유로 인한 서비스 이용 장애에 대하여 책임을 지지 않습니다.

③ 회사는 무료로 제공하는 서비스와 관련하여 관계 법령에 특별한 규정이 없는 한 책임을 부담하지 않습니다.

④ 회사는 회사의 고의 또는 중대한 과실이 없는 한 회원이 서비스를 이용하여 기대하는 수익 또는 효과를 보장하지 않습니다.

제11조 (분쟁 해결)

① 회사와 회원 간 발생한 분쟁은 상호 협의를 통해 해결하도록 노력합니다.

② 협의가 이루어지지 않는 경우에는 관계 법령에 따른 관할 법원에 소를 제기할 수 있습니다.

부칙

본 약관은 2026년 4월 1일부터 시행합니다.`,
  },
  privacy: {
    title: "개인정보 수집 및 이용 동의",
    body: (
      <div style={{ whiteSpace: "normal" }}>
        <p style={{ marginTop: 0 }}>이끌림 필라테스(이하 "회사")는 「개인정보 보호법」 등 관계 법령에 따라 회원의 개인정보를 안전하게 처리하며, 아래와 같이 개인정보를 수집·이용합니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>1. 수집하는 개인정보 항목</p>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>필수 항목</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>아이디</li><li>비밀번호</li><li>이름</li><li>이메일 주소</li><li>휴대폰 번호</li>
        </ul>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>선택 항목</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>출생연도</li>
        </ul>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>서비스 이용 과정에서 자동으로 수집되는 정보</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>서비스 이용 기록</li><li>접속 로그</li><li>쿠키(Cookie)</li>
          <li>접속 IP</li><li>기기 및 브라우저 정보</li><li>결제 및 이용 기록</li>
        </ul>
        <p style={{ margin: "0 0 4px" }}>※ 신용카드 정보 등 결제 정보는 회사가 직접 저장하지 않으며, 결제대행업체를 통해 안전하게 처리됩니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>2. 개인정보의 수집 및 이용 목적</p>
        <p style={{ margin: "0 0 6px" }}>회사는 다음의 목적을 위하여 개인정보를 수집·이용합니다.</p>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>① 회원가입 및 회원관리</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>본인 확인</li><li>회원 식별</li><li>부정 이용 방지</li><li>회원 서비스 제공</li>
        </ul>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>② 서비스 제공</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>온라인 강의 이용</li><li>수강 이력 관리</li><li>콘텐츠 제공</li>
          <li>고객 상담 및 문의 응대</li><li>공지사항 전달</li>
        </ul>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>③ 결제 및 환불 처리</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>유료 서비스 결제</li><li>환불 처리</li><li>구매 내역 관리</li>
        </ul>
        <p style={{ fontWeight: 600, marginBottom: "4px" }}>④ 서비스 개선</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>서비스 이용 통계 분석</li><li>서비스 품질 개선</li><li>오류 분석 및 안정성 확보</li>
        </ul>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>3. 개인정보 보유 및 이용기간</p>
        <p style={{ margin: "0 0 4px" }}>회사는 개인정보의 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.</p>
        <p style={{ margin: "0 0 8px" }}>다만 다음의 경우에는 관련 법령에 따라 일정 기간 보관합니다.</p>
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 10px", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={{ border: "1px solid #ccc", padding: "7px 10px", textAlign: "left", fontWeight: 600 }}>보관 항목</th>
              <th style={{ border: "1px solid #ccc", padding: "7px 10px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>보관 기간</th>
              <th style={{ border: "1px solid #ccc", padding: "7px 10px", textAlign: "left", fontWeight: 600 }}>관련 법령</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["계약 또는 청약철회 등에 관한 기록", "5년", "전자상거래 등에서의 소비자보호에 관한 법률"],
              ["대금결제 및 재화 등의 공급에 관한 기록", "5년", "전자상거래 등에서의 소비자보호에 관한 법률"],
              ["소비자의 불만 또는 분쟁처리에 관한 기록", "3년", "전자상거래 등에서의 소비자보호에 관한 법률"],
              ["접속기록", "3개월", "통신비밀보호법"],
            ].map(([item, period, law]) => (
              <tr key={item}>
                <td style={{ border: "1px solid #ccc", padding: "7px 10px" }}>{item}</td>
                <td style={{ border: "1px solid #ccc", padding: "7px 10px", whiteSpace: "nowrap" }}>{period}</td>
                <td style={{ border: "1px solid #ccc", padding: "7px 10px" }}>{law}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: "0 0 4px" }}>회원 탈퇴 시 개인정보는 원칙적으로 즉시 파기합니다.</p>
        <p style={{ margin: "0 0 4px" }}>다만, 분쟁 방지 및 민원 처리를 위해 필요한 경우 탈퇴일로부터 90일간 보관 후 파기할 수 있습니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>4. 개인정보의 제3자 제공</p>
        <p style={{ margin: "0 0 4px" }}>회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다.</p>
        <p style={{ margin: "0 0 6px" }}>다만, 다음의 경우에는 예외로 합니다.</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>이용자가 사전에 동의한 경우</li>
          <li>관계 법령에 따라 제공 의무가 있는 경우</li>
        </ul>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>5. 개인정보 처리 위탁</p>
        <p style={{ margin: "0 0 8px" }}>회사는 원활한 서비스 제공을 위하여 다음과 같이 개인정보 처리를 위탁할 수 있습니다.</p>
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "0 0 8px", fontSize: "12px" }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={{ border: "1px solid #ccc", padding: "7px 10px", textAlign: "left", fontWeight: 600 }}>수탁업체</th>
              <th style={{ border: "1px solid #ccc", padding: "7px 10px", textAlign: "left", fontWeight: 600 }}>위탁업무</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: "1px solid #ccc", padding: "7px 10px" }}>(주)포트원</td>
              <td style={{ border: "1px solid #ccc", padding: "7px 10px" }}>결제 서비스 제공 및 결제 처리</td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: "0 0 4px" }}>※ 위탁계약 체결 시 개인정보 보호 관련 법령을 준수하도록 관리·감독합니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>6. 이용자의 권리</p>
        <p style={{ margin: "0 0 6px" }}>이용자는 언제든지 자신의 개인정보에 대해 다음의 권리를 행사할 수 있습니다.</p>
        <ul style={{ margin: "0 0 8px", paddingLeft: "18px" }}>
          <li>개인정보 열람</li><li>개인정보 정정</li><li>개인정보 삭제</li><li>개인정보 처리정지 요청</li>
        </ul>
        <p style={{ margin: "0 0 4px" }}>회원은 마이페이지 또는 고객센터를 통해 위 권리를 행사할 수 있으며, 회사는 관계 법령에 따라 지체 없이 처리합니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>7. 개인정보 보호책임자</p>
        <p style={{ margin: "0 0 6px" }}>회사는 개인정보 처리에 관한 업무를 총괄하여 책임지고 있으며, 개인정보 관련 문의를 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px", listStyle: "none" }}>
          <li>성명 : 정지윤</li>
          <li>직책 : 대표</li>
          <li>이메일 : jjy@aimcoltd.com</li>
          <li>전화 : 0507-1377-6302</li>
        </ul>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>8. 동의 거부 권리</p>
        <p style={{ margin: "0 0 4px" }}>이용자는 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있습니다.</p>
        <p style={{ margin: 0 }}>다만, 필수 개인정보 수집 및 이용에 동의하지 않는 경우 회원가입 및 서비스 이용이 제한될 수 있습니다.</p>
      </div>
    ),
  },
  marketing: {
    title: "마케팅 정보 수신 동의",
    body: (
      <div style={{ whiteSpace: "normal" }}>
        <p style={{ marginTop: 0 }}>이끌림 필라테스(이하 "회사")는 회원에게 다양한 서비스 및 혜택을 제공하기 위하여 아래와 같이 광고성 정보를 발송할 수 있습니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>1. 수집 및 이용 목적</p>
        <p style={{ margin: "0 0 6px" }}>회사는 다음의 목적으로 마케팅 정보를 발송합니다.</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: "18px" }}>
          <li>신규 강의 및 콘텐츠 출시 안내</li>
          <li>할인 이벤트 및 프로모션 안내</li>
          <li>쿠폰 및 회원 혜택 제공</li>
          <li>회원 대상 이벤트 및 설문조사 안내</li>
          <li>서비스 업데이트 및 뉴스레터 제공</li>
        </ul>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>2. 발송 방법</p>
        <p style={{ margin: "0 0 6px" }}>회사는 다음의 수단을 통해 마케팅 정보를 발송할 수 있습니다.</p>
        <ul style={{ margin: "0 0 8px", paddingLeft: "18px" }}>
          <li>이메일</li>
        </ul>
        <p style={{ margin: "0 0 4px" }}>※ 향후 서비스 운영 정책에 따라 문자메시지(SMS), 카카오톡, 모바일 푸시 알림 등의 발송 수단이 추가될 수 있으며, 관련 법령에 따라 필요한 경우 별도의 동의를 받습니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>3. 보유 및 이용 기간</p>
        <p style={{ margin: "0 0 4px" }}>마케팅 정보 수신 동의는 회원 탈퇴 또는 동의 철회 시까지 유효합니다.</p>
        <p style={{ margin: "0 0 4px" }}>회원이 마케팅 정보 수신 동의를 철회한 경우에는 즉시 광고성 정보 발송을 중단합니다.</p>
        <p style={{ margin: "0 0 4px" }}>다만, 관계 법령에 따라 동의 및 철회 이력은 일정 기간 보관될 수 있습니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>4. 수신 동의 철회</p>
        <p style={{ margin: "0 0 6px" }}>회원은 언제든지 아래 방법을 통해 마케팅 정보 수신 동의를 철회하거나 변경할 수 있습니다.</p>
        <ul style={{ margin: "0 0 8px", paddingLeft: "18px" }}>
          <li>마이페이지 &gt; 마케팅 정보 수신 설정</li>
          <li>고객센터 문의</li>
        </ul>
        <p style={{ margin: "0 0 4px" }}>회사는 회원의 철회 요청을 받은 경우 지체 없이 광고성 정보 발송을 중단합니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>5. 유의사항</p>
        <p style={{ margin: "0 0 4px" }}>① 마케팅 정보 수신 동의는 선택사항이며, 동의하지 않더라도 회원가입 및 서비스 이용에는 어떠한 불이익도 없습니다.</p>
        <p style={{ margin: "0 0 4px" }}>② 회사는 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관계 법령을 준수하여 광고성 정보를 발송합니다.</p>
        <p style={{ margin: "0 0 4px" }}>③ 서비스 운영에 반드시 필요한 공지사항(서비스 점검, 결제 안내, 약관 변경, 보안 관련 안내 등)은 마케팅 수신 동의 여부와 관계없이 발송될 수 있습니다.</p>

        <p style={{ fontWeight: 700, marginTop: "18px", marginBottom: "6px" }}>동의 안내</p>
        <p style={{ margin: 0 }}>본인은 위 내용을 확인하였으며, 이끌림 필라테스의 마케팅 정보 수신에 동의합니다. (선택)</p>
      </div>
    ),
  },
};

// 컴포넌트 역할: 신규 회원 가입 입력과 제출을 처리하는 페이지 컴포넌트입니다.
export function SignupPage() {
  const navigate = useNavigate();
  const store = useAppStore();
  const [form, setForm] = useState({
    loginId: "",
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    phone: "",
    birthYear: "",
  });
  const [agreements, setAgreements] = useState({
    service: false,
    privacy: false,
    age: false,
    marketing: false,
  });

  // 약관 모달 상태
  const [termsModal, setTermsModal] = useState(null); // 'service' | 'privacy' | 'marketing' | null

  // 이메일 인증 상태
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailConfirming, setEmailConfirming] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const timerRef = useRef(null);

  // 이메일이 바뀌면 인증 상태 초기화
  function handleEmailChange(e) {
    setForm((cur) => ({ ...cur, email: e.target.value }));
    setEmailCodeSent(false);
    setEmailVerified(false);
    setEmailCode("");
    setTimerSec(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function startTimer(seconds) {
    setTimerSec(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimerSec((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function formatTimer(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function handleSendCode() {
    const email = form.email.trim();
    if (!email) { alert("이메일을 먼저 입력해 주세요."); return; }
    setEmailSending(true);
    try {
      const result = await apiRequest("/auth/signup/email-verification/request", {
        method: "POST",
        body: { email },
      });
      setEmailCodeSent(true);
      setEmailVerified(false);
      setEmailCode("");
      startTimer(result.expiresInSeconds || 300);
      alert("인증번호가 발송되었습니다. 이메일을 확인해 주세요.");
    } catch (err) {
      alert(err.message);
    } finally {
      setEmailSending(false);
    }
  }

  async function handleConfirmCode() {
    if (!emailCode.trim()) { alert("인증번호를 입력해 주세요."); return; }
    if (timerSec === 0) { alert("인증번호가 만료되었습니다. 다시 발송해 주세요."); return; }
    setEmailConfirming(true);
    try {
      await apiRequest("/auth/signup/email-verification/confirm", {
        method: "POST",
        body: { email: form.email.trim(), code: emailCode.trim() },
      });
      setEmailVerified(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerSec(0);
    } catch (err) {
      alert(err.message);
    } finally {
      setEmailConfirming(false);
    }
  }

  const allAgree = Object.values(agreements).every(Boolean);
  const requiredAgree = agreements.service && agreements.privacy && agreements.age;

  const canSubmit =
    form.loginId.trim() &&
    form.name.trim() &&
    form.email.trim() &&
    form.phone.trim() &&
    form.password.trim() &&
    form.passwordConfirm.trim() &&
    form.password === form.passwordConfirm &&
    requiredAgree &&
    emailVerified;

  function toggleAgreement(key) {
    setAgreements((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleAllAgreement() {
    const next = !allAgree;
    setAgreements({ service: next, privacy: next, age: next, marketing: next });
  }

  function handleViewDetail(key) {
    setTermsModal(key);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      if (!requiredAgree) { alert("필수 약관에 동의해 주세요."); return; }
      if (form.password !== form.passwordConfirm) { alert("비밀번호 확인이 일치하지 않습니다."); return; }
      if (!emailVerified) { alert("이메일 인증을 완료해 주세요."); return; }

      await store.signupUser({
        loginId: form.loginId.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        phone: form.phone.trim(),
        birthYear: form.birthYear.trim() ? form.birthYear.trim() : null,
        marketingAgree: agreements.marketing,
      });
      alert("회원가입이 완료되었습니다.");
      navigate("/mypage");
    } catch (error) {
      alert(error.message);
    }
  }

  const activeTerms = termsModal ? TERMS_CONTENT[termsModal] : null;

  return (
    <>
      {activeTerms && (
        <div
          onClick={() => setTermsModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9000, padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "560px",
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px", borderBottom: "1px solid #eee", flexShrink: 0,
            }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#2c2c2c" }}>
                {activeTerms.title}
              </h3>
              <button
                onClick={() => setTermsModal(null)}
                style={{
                  background: "none", border: "none", fontSize: "18px",
                  cursor: "pointer", color: "#888", padding: "0 4px", lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{
              overflowY: "auto", padding: "20px 24px",
              fontSize: "13px", lineHeight: "1.85", color: "#444",
              whiteSpace: "pre-wrap", wordBreak: "keep-all",
            }}>
              {activeTerms.body}
            </div>
            <div style={{
              padding: "16px 24px", borderTop: "1px solid #eee",
              flexShrink: 0, textAlign: "right",
            }}>
              <button
                onClick={() => setTermsModal(null)}
                style={{
                  background: "#2c2c2c", color: "#fff", border: "none",
                  borderRadius: "30px", padding: "10px 32px", fontSize: "14px",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      <PageLayout subpage mainClass="auth-page">
        <section className="auth-card signup-auth-card">
          <p className="section-kicker">회원가입</p>
          <h1>회원가입</h1>
          <p className="section-text">회원가입 후 교육 영상 구매와 수강 이력을 관리할 수 있습니다.</p>
          <div className="signup-coupon-box">
            <strong>신규 회원 웰컴 혜택 진행 중</strong>
            <p>10초만에 가입하고 다양한 혜택을 받아보세요.</p>
          </div>

          <form className="auth-form signup-form-shell" onSubmit={handleSubmit}>
            <label>
              아이디
              <input
                type="text"
                placeholder="영문/숫자 조합 아이디를 입력해 주세요"
                required
                value={form.loginId}
                onChange={(event) => setForm((current) => ({ ...current, loginId: event.target.value }))}
              />
            </label>

            <label>
              이름
              <input
                type="text"
                placeholder="실명으로 공백 없이 입력해 주세요"
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>

            <div>
              <label>이메일</label>
              <div className="field-inline">
                <input
                  type="email"
                  required
                  placeholder="실제 사용하시는 이메일 주소"
                  value={form.email}
                  onChange={handleEmailChange}
                  disabled={emailVerified}
                />
                <button
                  className="field-inline-button"
                  type="button"
                  onClick={handleSendCode}
                  disabled={emailSending || emailVerified}
                >
                  {emailVerified ? "인증 완료" : emailCodeSent ? "재발송" : "인증메일 발송"}
                </button>
              </div>

              {emailVerified && (
                <p style={{ marginTop: "6px", fontSize: "13px", color: "#2e7d32", fontWeight: 600 }}>
                  ✓ 이메일 인증이 완료되었습니다.
                </p>
              )}

              {emailCodeSent && !emailVerified && (
                <div style={{ marginTop: "8px" }}>
                  <div className="field-inline">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="인증번호 6자리 입력"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    <button
                      className="field-inline-button"
                      type="button"
                      onClick={handleConfirmCode}
                      disabled={emailConfirming || timerSec === 0}
                    >
                      확인
                    </button>
                  </div>
                  {timerSec > 0 ? (
                    <p style={{ marginTop: "4px", fontSize: "12px", color: "#888" }}>
                      남은 시간 <strong style={{ color: timerSec <= 60 ? "#c0392b" : "#555" }}>{formatTimer(timerSec)}</strong>
                    </p>
                  ) : (
                    <p style={{ marginTop: "4px", fontSize: "12px", color: "#c0392b" }}>
                      인증번호가 만료되었습니다. 재발송해 주세요.
                    </p>
                  )}
                </div>
              )}
            </div>

            <label>
              연락처 (숫자만)
              <input
                type="tel"
                required
                placeholder="- 없이 숫자만 입력해 주세요"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value.replace(/\D/g, ""),
                  }))
                }
              />
            </label>

            <label>
              출생연도 (선택)
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="예: 1994"
                value={form.birthYear}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    birthYear: event.target.value.replace(/\D/g, "").slice(0, 4),
                  }))
                }
              />
            </label>

            <label>
              비밀번호
              <input
                type="password"
                required
                placeholder="비밀번호를 입력해 주세요"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>

            <label>
              비밀번호 확인
              <input
                type="password"
                required
                placeholder="비밀번호를 다시 입력해 주세요"
                value={form.passwordConfirm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, passwordConfirm: event.target.value }))
                }
              />
            </label>

            <section className="agreement-box">
              <label className="agreement-all">
                <input type="checkbox" checked={allAgree} onChange={toggleAllAgreement} />
                <span>전체 동의</span>
              </label>

              <div className="agreement-list">
                <div className="agreement-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={agreements.service}
                      onChange={() => toggleAgreement("service")}
                    />
                    <span>서비스 이용약관 동의 (필수)</span>
                  </label>
                  <button type="button" className="agreement-view-btn" onClick={() => handleViewDetail("service")}>
                    보기
                  </button>
                </div>

                <div className="agreement-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={agreements.privacy}
                      onChange={() => toggleAgreement("privacy")}
                    />
                    <span>개인정보 수집 및 이용 동의 (필수)</span>
                  </label>
                  <button type="button" className="agreement-view-btn" onClick={() => handleViewDetail("privacy")}>
                    보기
                  </button>
                </div>

                <div className="agreement-row">
                  <label>
                    <input type="checkbox" checked={agreements.age} onChange={() => toggleAgreement("age")} />
                    <span>만 14세 이상입니다 (필수)</span>
                  </label>
                </div>

                <div className="agreement-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={agreements.marketing}
                      onChange={() => toggleAgreement("marketing")}
                    />
                    <span>마케팅 정보 수신 동의 (선택)</span>
                  </label>
                  <button type="button" className="agreement-view-btn" onClick={() => handleViewDetail("marketing")}>
                    보기
                  </button>
                </div>
              </div>
            </section>

            <button className="pill-button full" type="submit" disabled={!canSubmit}>
              회원가입하기
            </button>
          </form>
        </section>
      </PageLayout>
    </>
  );
}
