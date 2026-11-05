import { useEffect } from "react";
import { Link, useNavigationType } from "react-router-dom";
import logo from "@/assets/logo.png";
import Footer from "@/layouts/footer/footer";
import { LEGAL_REVISIONS } from "../config";
import { LEGAL_DOCUMENTS } from "../content";
import type { LegalSlug } from "../types/legal.type";
import { fillLegalVariables } from "../utils/fillLegalVariables";
import { resolveLegalRevision } from "../utils/resolveLegalRevision";
import {
  Article,
  ChangeNotice,
  EffectiveDate,
  History,
  Header,
  HomeLink,
  LogoMark,
  PageContainer,
  TableWrapper,
} from "./legalPage.styles";

interface LegalPageProps {
  slug: LegalSlug;
}

/**
 * 로그인 없이 열리는 법적 문서 페이지. 앱 셸(App) 밖에서 렌더되므로 자체 헤더·푸터를 가진다.
 * 링크로 다른 문서에 가면 SPA라 스크롤이 유지되므로, 링크 이동(PUSH/REPLACE)일 때만 맨 위로 올린다.
 */
const LegalPage = ({ slug }: LegalPageProps) => {
  const legalDocument = LEGAL_DOCUMENTS[slug];
  // 렌더마다 오늘(서울) 기준으로 판을 고른다 — 시행일이 지나면 배포 없이 새 판이 보인다.
  const { current, upcoming, history } = resolveLegalRevision(LEGAL_REVISIONS, new Date());
  const fill = (text: string) => fillLegalVariables(text, current);

  const navigationType = useNavigationType();

  // 뒤로가기·앞으로가기(POP)는 브라우저가 이전 위치를 복원하게 둔다. 직접 진입도 POP이지만
  // 그때는 이미 맨 위다.
  useEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [slug, navigationType]);

  return (
    <PageContainer>
      <Header>
        <HomeLink to="/" aria-label="ToDoDo 홈">
          <LogoMark src={logo} alt="" />
          ToDoDo
        </HomeLink>
      </Header>
      <Article>
        <h1>{fill(legalDocument.title)}</h1>
        <EffectiveDate>시행일: {fill("{{effectiveDate}}")}</EffectiveDate>
        {upcoming && (
          // 약관 11조·방침 13조의 "시행 7일 전부터 서비스 화면에 알린다"를 이 공지로 지킨다.
          <ChangeNotice role="note" aria-label="변경 예정 안내">
            <strong>변경 예정 안내</strong> {upcoming.effectiveDate}부터 이 문서가 바뀝니다:{" "}
            {upcoming.change}
          </ChangeNotice>
        )}
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
            {section.links?.map(({ to, label }) => (
              <p key={to}>
                <Link to={to}>{label}</Link>
              </p>
            ))}
            {section.table && (
              <TableWrapper role="region" aria-label={`${fill(section.heading)} 표`} tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      {section.table.headers.map((header) => (
                        <th key={header} scope="col">
                          {fill(header)}
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
        {history.length > 0 && (
          <History role="region" aria-label="변경 이력">
            <h2>변경 이력</h2>
            <ul>
              {history.map(({ effectiveDate, change }) => (
                <li key={effectiveDate}>
                  {effectiveDate} 시행: {change}
                </li>
              ))}
            </ul>
          </History>
        )}
      </Article>
      <Footer showBusinessInfo />
    </PageContainer>
  );
};

export default LegalPage;
