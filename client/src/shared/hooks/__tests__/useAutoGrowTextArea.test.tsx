import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import useAutoGrowTextArea from "../useAutoGrowTextArea";

/**
 * jsdom에는 레이아웃 엔진이 없어 실제 높이 계산은 검증할 수 없다.
 * 대신 브라우저별 차이를 만드는 "읽는 순서"를 고정한다.
 */
const createTextArea = (scrollHeight: number) => {
  const el = document.createElement("textarea");
  const reads: string[] = [];

  Object.defineProperty(el, "offsetHeight", {
    get: () => {
      reads.push("offsetHeight");
      return 0;
    },
  });
  Object.defineProperty(el, "scrollHeight", {
    get: () => {
      reads.push("scrollHeight");
      return scrollHeight;
    },
  });

  return { el, reads };
};

describe("useAutoGrowTextArea", () => {
  it("내용 높이(scrollHeight)를 인라인 height로 반영한다", () => {
    const { el } = createTextArea(120);
    const { result } = renderHook(() => useAutoGrowTextArea(""));

    result.current.setRef(el);

    expect(el.style.height).toBe("120px");
  });

  it("scrollHeight를 읽기 전에 offsetHeight로 리플로우를 강제한다", () => {
    // Firefox는 height:auto를 반영한 레이아웃을 즉시 계산하지 않아, 리플로우를
    // 강제하지 않으면 scrollHeight가 직전 높이를 그대로 돌려주고 높이가 전혀 늘지 않는다.
    // (Chromium/WebKit은 이 줄이 없어도 동작하므로, 지우면 Firefox에서만 조용히 깨진다.)
    const { el, reads } = createTextArea(120);
    const { result } = renderHook(() => useAutoGrowTextArea(""));

    result.current.setRef(el);

    expect(reads).toEqual(["offsetHeight", "scrollHeight"]);
  });

  it("ref가 없으면 아무 일도 하지 않는다", () => {
    const { result } = renderHook(() => useAutoGrowTextArea(""));

    expect(() => {
      result.current.setRef(null);
      result.current.resize();
    }).not.toThrow();
  });
});
