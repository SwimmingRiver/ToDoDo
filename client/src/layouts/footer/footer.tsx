import { styled } from "styled-components";
import { media } from "../../styles/breakpoints";
import { colors } from "@/styles/colors";
import LegalLinks from "@/features/legal/components/legalLinks";

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

const Footer = () => {
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
      <FooterLink href="mailto:swimmingr@gmail.com">Contact</FooterLink>
      <LegalDivider>|</LegalDivider>
      <LegalGroup>
        <LegalLinks />
      </LegalGroup>
    </FooterContainer>
  );
};

export default Footer;
