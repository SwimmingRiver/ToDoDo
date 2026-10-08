import { LEGAL_LINKS } from "../content";
import { LegalLink, LinksNav } from "./legalLinks.styles";

interface LegalLinksProps {
  /** 드로어처럼 링크를 누르면 닫혀야 하는 컨테이너가 넘긴다. */
  onNavigate?: () => void;
}

const LegalLinks = ({ onNavigate }: LegalLinksProps) => (
  <LinksNav aria-label="약관 및 정책">
    {LEGAL_LINKS.map(({ to, label }) => (
      <LegalLink key={to} to={to} onClick={onNavigate}>
        {label}
      </LegalLink>
    ))}
  </LinksNav>
);

export default LegalLinks;
