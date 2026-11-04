import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../config", () => ({
  LEGAL_CONFIG: { sellerName: "홍길동", contactEmail: "", effectiveDate: "", privacyOfficer: "" },
}));
vi.mock("../../content", () => ({
  LEGAL_DOCUMENTS: {
    terms: {
      slug: "terms",
      title: "{{sellerName}} 약관",
      sections: [
        {
          heading: "{{sellerName}} 조항",
          table: { headers: ["{{sellerName}} 항목", "내용"], rows: [["a", "b"]] },
        },
      ],
    },
  },
}));

import LegalPage from "../legalPage";

describe("LegalPage 변수 치환 범위", () => {
  it("제목·표 머리글·표 영역 이름에도 판매자 표기를 넣는다", () => {
    render(
      <MemoryRouter>
        <LegalPage slug="terms" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "홍길동 약관" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "홍길동 항목" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "홍길동 조항 표" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("{{");
  });
});
