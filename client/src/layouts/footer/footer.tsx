import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import { colors } from "@/styles/colors";
import LegalLinks from "@/features/legal/components/legalLinks";
// 본문(content/)이 아니라 설정만 가져온다 — 모든 화면이 받는 공유 청크에 약관 전문이 실리지 않게.
import { BUSINESS_INFO, LEGAL_REVISIONS } from "@/features/legal/config";
import { resolveLegalRevision } from "@/features/legal/utils/resolveLegalRevision";

const FooterContainer = styled.footer`
  width: 100%;
  border-top: 1px solid ${colors.border.tertiary};
  padding: 16px 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  container-type: inline-size;
  font-size: 14px;
  color: ${colors.text.secondary};

  ${media.mobile} {
    padding: 12px 8px;
    font-size: 12px;
    gap: 6px;
  }
`;

const FooterLink = styled.a`
  color: ${colors.text.secondary};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

// 원래 리터럴(회색, ccc 계열)은 매핑표에 없어 가장 가까운 text 역할 토큰(text.tertiary)을 사용.
const Divider = styled.span`
  color: ${colors.text.tertiary};
`;

// 법적 링크 묶음이 줄바꿈되면 앞의 "|"가 윗줄 끝에 혼자 남는다(실측: 푸터 폭 270~490px).
// 화면 폭이 아니라 푸터 폭 기준(컨테이너 쿼리)으로, 좁을 때는 구분자를 숨기고 링크를 다음 줄 가운데로 내린다.
const LEGAL_LINE_BREAK = "@container (max-width: 500px)";

const LegalDivider = styled(Divider)`
  ${LEGAL_LINE_BREAK} {
    display: none;
  }
`;

const LegalGroup = styled.div`
  display: flex;

  ${LEGAL_LINE_BREAK} {
    flex-basis: 100%;
    justify-content: center;
  }
`;

// 줄마다 "라벨: 값"을 이어 붙이고, 좁으면 항목 단위로 줄바꿈된다.
const BusinessInfo = styled.section`
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 12px;
  margin: 4px 0 0;
  padding: 0;
  font-size: 12px;
  line-height: 1.6;
  color: ${colors.text.secondary};

  dl {
    display: contents;
  }

  div {
    display: flex;
    gap: 4px;
  }

  dt::after {
    content: ":";
  }

  dd {
    margin: 0;
  }
`;

interface FooterProps {
  /**
   * 전자상거래법 신원정보(상호·대표자·사업자번호 등) 표시. 판매가 일어나는 공개 화면
   * (랜딩·법적 문서·게스트)에서만 켠다 — 앱 안 푸터는 간결하게 둔다.
   */
  showBusinessInfo?: boolean;
}

const Footer = ({ showBusinessInfo = false }: FooterProps) => {
  const { contactEmail } = resolveLegalRevision(LEGAL_REVISIONS, new Date()).current;
  const businessRows: [string, string][] = [
    ["상호", BUSINESS_INFO.tradeName],
    ["대표자", BUSINESS_INFO.representative],
    ["사업자등록번호", BUSINESS_INFO.registrationNumber],
    ["통신판매업신고", BUSINESS_INFO.mailOrderNumber || "신고 준비 중"],
    ["주소", BUSINESS_INFO.address],
    ["전화", BUSINESS_INFO.phone],
    ["이메일", contactEmail],
  ];

  return (
    <FooterContainer>
      <span>© 2025 ToDoDo</span>
      <Divider>|</Divider>
      <FooterLink
        href="https://github.com/SwimmingRiver/tododo"
        target="_blank"
      >
        GitHub
      </FooterLink>
      <Divider>|</Divider>
      <FooterLink href={`mailto:${contactEmail}`}>Contact</FooterLink>
      <LegalDivider>|</LegalDivider>
      <LegalGroup>
        <LegalLinks />
      </LegalGroup>
      {showBusinessInfo && (
        <BusinessInfo aria-label="사업자정보">
          <dl>
            {businessRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </BusinessInfo>
      )}
    </FooterContainer>
  );
};

export default Footer;
