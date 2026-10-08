import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("../useUpgradeInterest", () => ({ useUpgradeInterest: () => ({ submitInterest: vi.fn(), isPending: false }) }));

import { useInterestCta, useNavigateToPremiumCta } from "../usePremiumCta";

describe("usePremiumCta", () => {
  it("결제가 꺼져 있을 때 쓰는 구현은 기존 '관심 있어요'", () => {
    const { result } = renderHook(() => useInterestCta("구글 캘린더 연동 기능"));
    expect(result.current.ctaLabel).toBe("관심 있어요");
  });

  it("결제가 켜져 있을 때 쓰는 구현은 /premium으로 이동", () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={["/insights"]}>{children}</MemoryRouter>;
    const { result } = renderHook(() => ({ cta: useNavigateToPremiumCta("통계"), location: useLocation() }), { wrapper });
    expect(result.current.cta.ctaLabel).toBe("프리미엄 알아보기");
    act(() => result.current.cta.onCtaClick());
    expect(result.current.location.pathname).toBe("/premium");
  });
});
