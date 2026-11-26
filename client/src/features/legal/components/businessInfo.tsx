import { styled } from "styled-components";
import { colors } from "@/styles/colors";
// 본문(content/)이 아니라 설정만 가져온다 — 모든 화면이 받는 공유 청크에 약관 전문이 실리지 않게.
import { BUSINESS_INFO, LEGAL_REVISIONS } from "../config";
import { resolveLegalRevision } from "../utils/resolveLegalRevision";

// 줄마다 "라벨: 값"을 이어 붙이고, 좁으면 항목 단위로 줄바꿈된다.
const Section = styled.section<{ $align: "center" | "start" }>`
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  justify-content: ${({ $align }) => ($align === "center" ? "center" : "flex-start")};
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

interface BusinessInfoProps {
  align?: "center" | "start";
}

/**
 * 전자상거래법 제10조 신원정보(상호·대표자·사업자번호 등). 결제는 로그인 후 앱 안에서
 * 일어나므로 공개 화면뿐 아니라 모든 화면(푸터, 모바일 웹은 드로어)에서 보여준다.
 */
const BusinessInfo = ({ align = "center" }: BusinessInfoProps) => {
  const { contactEmail } = resolveLegalRevision(LEGAL_REVISIONS, new Date()).current;
  const rows: [string, string][] = [
    ["상호", BUSINESS_INFO.tradeName],
    ["대표자", BUSINESS_INFO.representative],
    ["사업자등록번호", BUSINESS_INFO.registrationNumber],
    ["통신판매업신고", BUSINESS_INFO.mailOrderNumber || "신고 준비 중"],
    ["주소", BUSINESS_INFO.address],
    ["전화", BUSINESS_INFO.phone],
    ["이메일", contactEmail],
  ];

  return (
    <Section aria-label="사업자정보" $align={align}>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
};

export default BusinessInfo;
