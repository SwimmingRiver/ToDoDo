import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// 푸터는 앱 셸·랜딩·게스트가 모두 불러온다. 링크가 문서 본문을 import하면 약관 전문이
// 공유 청크에 실려 모든 화면이 받게 되므로, 본문 모듈을 불러오는 순간 실패하게 한다.
vi.mock("../../content/terms", () => {
  throw new Error("LegalLinks가 문서 본문을 import하면 안 된다");
});
vi.mock("../../content/privacy", () => {
  throw new Error("LegalLinks가 문서 본문을 import하면 안 된다");
});
vi.mock("../../content/refund", () => {
  throw new Error("LegalLinks가 문서 본문을 import하면 안 된다");
});

import LegalLinks from "../legalLinks";

describe("LegalLinks", () => {
  it("문서 본문 없이 링크 3개를 그린다", () => {
    render(
      <MemoryRouter>
        <LegalLinks />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/terms",
      "/privacy",
      "/refund",
    ]);
  });
});
