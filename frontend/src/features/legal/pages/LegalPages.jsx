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

// 컴포넌트 역할: 앱 접근권한을 필수와 선택으로 구분해 고지합니다.
//
// 정보통신망법 제22조의2는 접근권한을 필수·선택으로 구분해 고지하고,
// 선택 권한 거부를 이유로 서비스 제공을 거부하지 못하게 합니다. 위반 시 과태료 대상입니다.
// 이 앱은 위치·사진·카메라 권한을 요청하지 않으므로 알림만 선택 권한으로 안내합니다.
export function AppPermissionsPage() {
  return (
    <PageLayout subpage>
      <section className="legal-page">
        <h1 className="legal-page-title">앱 접근권한 안내</h1>
        <p className="legal-page-description">
          이끌림 필라테스 앱이 사용하는 접근권한과 그 목적을 안내합니다. 선택 권한에 동의하지 않아도
          앱의 나머지 기능은 그대로 이용할 수 있습니다.
        </p>

        <div className="legal-page-body">
          <h2>필수 접근권한</h2>
          <table>
            <thead>
              <tr>
                <th>권한</th>
                <th>이용 목적</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>네트워크 연결</td>
                <td>수업 일정과 수강권 정보를 불러오고 예약을 처리하기 위해 필요합니다.</td>
              </tr>
            </tbody>
          </table>

          <h2>선택 접근권한</h2>
          <table>
            <thead>
              <tr>
                <th>권한</th>
                <th>이용 목적</th>
                <th>거부 시</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>알림</td>
                <td>예약 확정·변경·취소, 대기 순번 변동, 수강권 만료 안내를 받기 위해 사용합니다.</td>
                <td>알림만 받지 못하며 예약과 수강 기능은 그대로 이용할 수 있습니다.</td>
              </tr>
            </tbody>
          </table>

          <h2>요청하지 않는 권한</h2>
          <p>
            이 앱은 위치, 사진·동영상, 카메라, 마이크, 주소록, 신체활동 권한을 요청하지 않습니다.
            광고 식별자도 수집하지 않습니다.
          </p>

          <h2>권한 철회 방법</h2>
          <p>
            이미 허용한 권한은 언제든지 철회할 수 있습니다. Android는 설정 앱의 애플리케이션 목록에서
            이끌림 필라테스를 선택한 뒤 권한 항목에서 변경하고, 앱 안에서는 마이페이지의 알림 설정에서
            알림 수신을 끌 수 있습니다.
          </p>
        </div>
      </section>
    </PageLayout>
  );
}
