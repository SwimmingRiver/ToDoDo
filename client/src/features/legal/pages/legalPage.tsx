import { useEffect } from "react";
import logo from "@/assets/logo.png";
import Footer from "@/layouts/footer/footer";
import { LEGAL_CONFIG } from "../config";
import { LEGAL_DOCUMENTS } from "../content";
import type { LegalSlug } from "../types/legal.type";
import { fillLegalVariables } from "../utils/fillLegalVariables";
import {
  Article,
  EffectiveDate,
  Header,
  HomeLink,
  LogoMark,
  PageContainer,
  TableWrapper,
} from "./legalPage.styles";

interface LegalPageProps {
  slug: LegalSlug;
}

const fill = (text: string) => fillLegalVariables(text, LEGAL_CONFIG);

/**
 * 로그인 없이 열리는 법적 문서 페이지. 앱 셸(App) 밖에서 렌더되므로 자체 헤더·푸터를 가진다.
 * 푸터에서 다른 문서로 이동하면 SPA라 스크롤이 유지되므로, 문서가 바뀔 때 맨 위로 올린다.
 */
const LegalPage = ({ slug }: LegalPageProps) => {
  const legalDocument = LEGAL_DOCUMENTS[slug];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  return (
    <PageContainer>
      <Header>
        <HomeLink to="/" aria-label="ToDoDo 홈">
          <LogoMark src={logo} alt="" />
          ToDoDo
        </HomeLink>
      </Header>
      <Article>
        <h1>{legalDocument.title}</h1>
        <EffectiveDate>시행일: {fill("{{effectiveDate}}")}</EffectiveDate>
        {legalDocument.sections.map((section) => (
          <section key={section.heading}>
            <h2>{fill(section.heading)}</h2>
            {section.paragraphs?.map((text, i) => <p key={i}>{fill(text)}</p>)}
            {section.items && (
              <ul>
                {section.items.map((text, i) => (
                  <li key={i}>{fill(text)}</li>
                ))}
              </ul>
            )}
            {section.table && (
              <TableWrapper role="region" aria-label={`${section.heading} 표`} tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      {section.table.headers.map((header) => (
                        <th key={header} scope="col">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>{fill(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </section>
        ))}
      </Article>
      <Footer />
    </PageContainer>
  );
};

export default LegalPage;
