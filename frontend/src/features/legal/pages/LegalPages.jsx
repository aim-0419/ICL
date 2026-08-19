// 파일 역할: 스토어 심사에 필요한 공개 URL 페이지를 제공합니다.
//
// Google Play는 개인정보처리방침과 계정 삭제 요청 경로를 앱 밖에서도 열 수 있는
// 활성 URL로 요구합니다. 앱을 이미 지운 사용자도 접근할 수 있어야 하므로
// 로그인 없이 열리는 라우트로 둡니다.
//
// 본문은 가입 동의 모달과 같은 원본(shared/legal/legalDocuments.jsx)을 씁니다.
// 앱 내 문구와 공개 URL 문구가 다르면 반려 사유가 되기 때문입니다.
import React from "react";
import { Link } from "react-router-dom";

import { PageLayout } from "../../../shared/components/PageLayout.jsx";
import { TERMS_CONTENT } from "../../../shared/legal/legalDocuments.jsx";

// 컴포넌트 역할: 약관 본문을 공통 레이아웃으로 감쌉니다.
// body가 문자열이면 줄바꿈을 보존해야 하므로 pre-wrap으로 렌더합니다.
function LegalDocument({ title, body, description }) {
  return (
    <PageLayout subpage>
      <section className="legal-page">
        <h1 className="legal-page-title">{title}</h1>
        {description ? <p className="legal-page-description">{description}</p> : null}
        <div className="legal-page-body">
          {typeof body === "string" ? <div style={{ whiteSpace: "pre-wrap" }}>{body}</div> : body}
        </div>
      </section>
    </PageLayout>
  );
}

// 컴포넌트 역할: 개인정보 처리방침 공개 페이지입니다.
export function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="개인정보 처리방침"
      body={TERMS_CONTENT.privacy.body}
      description="이끌림 필라테스가 수집하는 개인정보의 항목과 이용 목적, 보유 기간, 국외 이전 내역을 안내합니다."
    />
  );
}

// 컴포넌트 역할: 서비스 이용약관 공개 페이지입니다.
export function TermsPage() {
  return <LegalDocument title="서비스 이용약관" body={TERMS_CONTENT.service.body} />;
}

// 컴포넌트 역할: 앱을 삭제한 사용자도 계정 삭제를 요청할 수 있는 안내 페이지입니다.
// 앱 안에서는 마이페이지에서 바로 탈퇴할 수 있고, 이 페이지는 앱 없이 접근하는 경로입니다.
export function AccountDeletionPage() {
  return (
    <PageLayout subpage>
      <section className="legal-page">
        <h1 className="legal-page-title">계정 삭제 요청</h1>
        <p className="legal-page-description">
          이끌림 필라테스 계정과 계정에 연결된 개인정보를 삭제하는 방법을 안내합니다.
        </p>

        <div className="legal-page-body">
          <h2>앱 또는 웹에서 직접 삭제</h2>
          <ol>
            <li>이끌림 필라테스에 로그인합니다.</li>
            <li>마이페이지로 이동합니다.</li>
            <li>회원 탈퇴를 선택하고 본인 확인을 위한 휴대폰 인증을 완료합니다.</li>
          </ol>
          <p>
            <Link to="/mypage">마이페이지로 이동</Link>
          </p>

          <h2>앱을 이미 삭제한 경우</h2>
          <p>
            아래 연락처로 가입한 아이디와 이름을 알려주시면 본인 확인 후 계정을 삭제해 드립니다.
            접수 후 영업일 기준 3일 이내에 처리합니다.
          </p>
          <ul>
            <li>전화 0507-1377-6302</li>
            <li>
              <Link to="/community/inquiry">문의 게시판으로 요청</Link>
            </li>
          </ul>

          <h2>삭제되는 정보와 보관되는 정보</h2>
          <p>
            계정 삭제 시 이름, 연락처, 이메일 등 회원 정보와 예약·수강 이력이 삭제됩니다.
            다만 전자상거래법 등 관계 법령이 보관을 의무화한 결제·거래 기록은 법정 보존 기간 동안
            분리 보관한 뒤 파기합니다.
          </p>
          <p>
            자세한 내용은 <Link to="/privacy">개인정보 처리방침</Link>을 확인해 주세요.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
