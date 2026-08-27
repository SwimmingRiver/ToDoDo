import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  extractLinks,
  toDescriptionSegments,
  DESCRIPTION_MAX_LENGTH,
} from "../descriptionLinks";
import { FEEDBACK_CONTENT_MAX_LENGTH } from "@/features/feedback/api/feedbackApi";

describe("extractLinks", () => {
  it("빈 값이면 빈 배열을 반환한다", () => {
    expect(extractLinks(undefined)).toEqual([]);
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks("")).toEqual([]);
  });

  it("링크가 없는 평범한 설명에서는 아무것도 찾지 않는다", () => {
    expect(extractLinks("장보기: 우유, 계란 사기")).toEqual([]);
  });

  describe("경계 판정 — 정규식으로는 틀리는 케이스들", () => {
    it("문장 끝 마침표는 URL에 포함하지 않는다", () => {
      expect(extractLinks("자료는 https://example.com/docs. 확인해줘")[0].href).toBe(
        "https://example.com/docs"
      );
    });

    it("문장을 감싼 괄호는 URL에 포함하지 않는다", () => {
      expect(extractLinks("(참고: https://example.com)")[0].href).toBe(
        "https://example.com/"
      );
    });

    it("URL 자체의 괄호는 보존한다", () => {
      // 위키백과처럼 경로에 괄호가 들어가는 URL — 위 케이스와 구분되어야 한다.
      const [link] = extractLinks("https://ko.wikipedia.org/wiki/Function_(math)");
      expect(decodeURI(link.href)).toBe(
        "https://ko.wikipedia.org/wiki/Function_(math)"
      );
    });
  });

  describe("오탐 차단", () => {
    it("파일명을 링크로 잡지 않는다", () => {
      // .sh / .zip / .mov 는 전부 실제 TLD라서 TLD 목록만 보면 링크로 판정된다.
      expect(extractLinks("setup.sh 실행하고 demo.zip 풀기, clip.mov 확인")).toEqual([]);
    });

    it("스킴 없는 맨 도메인은 링크로 잡지 않는다", () => {
      expect(extractLinks("example.com 에서 확인")).toEqual([]);
    });

    it("javascript: 스킴은 링크로 잡지 않는다", () => {
      expect(extractLinks("javascript:alert(1)")).toEqual([]);
    });

    it("이메일 주소는 링크 대상이 아니다", () => {
      expect(extractLinks("문의는 someone@example.com 으로")).toEqual([]);
    });
  });

  describe("정상 감지", () => {
    it("https URL을 호스트명 라벨과 함께 반환한다", () => {
      expect(extractLinks("시안 https://www.figma.com/file/abc 확인")).toEqual([
        { href: "https://www.figma.com/file/abc", label: "figma.com" },
      ]);
    });

    it("스킴이 없는 www. 는 https로 보정한다", () => {
      expect(extractLinks("www.example.com")[0].href).toBe("https://www.example.com/");
    });

    it("명시된 http는 https로 바꾸지 않는다", () => {
      // 사용자가 적은 주소를 임의로 승격하면 열리지 않는 페이지가 생길 수 있다.
      expect(extractLinks("http://legacy.example.com")[0].href).toBe(
        "http://legacy.example.com/"
      );
    });

    it("여러 링크를 순서대로 반환한다", () => {
      expect(
        extractLinks("기획서: https://a.com/spec\n시안: https://b.com/design").map(
          (l) => l.label
        )
      ).toEqual(["a.com", "b.com"]);
    });

    it("같은 URL이 여러 번 나와도 한 번만 반환한다", () => {
      expect(extractLinks("https://a.com/x 랑 https://a.com/x 둘 다")).toHaveLength(1);
    });
  });

  it("firestore.rules의 모든 상한이 알려진 클라이언트 상수 중 하나와 일치한다", () => {
    // 주석으로만 동기화를 약속하면 한쪽만 바뀌었을 때 아무도 못 잡는다. 클라이언트는
    // 통과시키는데 서버가 permission-denied로 거부하는, 원인 파악이 어려운 상태가 된다.
    const rules = readFileSync(resolve(process.cwd(), "../firestore.rules"), "utf-8");
    const limits = [...rules.matchAll(/\.size\(\)\s*<=\s*(\d+)/g)].map((m) => Number(m[1]));

    expect(limits.length).toBeGreaterThan(0);
    const knownLimits = [DESCRIPTION_MAX_LENGTH, FEEDBACK_CONTENT_MAX_LENGTH];
    for (const limit of limits) {
      expect(knownLimits).toContain(limit);
    }
  });
});

describe("toDescriptionSegments", () => {
  it("빈 값이면 빈 배열을 반환한다", () => {
    expect(toDescriptionSegments(undefined)).toEqual([]);
    expect(toDescriptionSegments("")).toEqual([]);
  });

  it("링크가 없으면 통짜 비링크 조각 하나를 반환한다", () => {
    expect(toDescriptionSegments("우유 사기")).toEqual([
      { text: "우유 사기", isLink: false },
    ]);
  });

  it("링크 앞뒤 텍스트를 보존하며 쪼갠다", () => {
    expect(toDescriptionSegments("시안 https://a.com/x 확인")).toEqual([
      { text: "시안 ", isLink: false },
      { text: "https://a.com/x", isLink: true },
      { text: " 확인", isLink: false },
    ]);
  });

  it("링크로 시작하고 끝나도 빈 조각을 만들지 않는다", () => {
    expect(toDescriptionSegments("https://a.com/x")).toEqual([
      { text: "https://a.com/x", isLink: true },
    ]);
  });

  it("같은 URL이 두 번 나오면 두 곳 모두 링크로 표시한다", () => {
    // extractLinks(열기 버튼)는 중복을 제거하지만, 하이라이트는 요구가 정반대다.
    const segments = toDescriptionSegments("https://a.com/x 랑 https://a.com/x");
    expect(segments.filter((s) => s.isLink)).toHaveLength(2);
    expect(extractLinks("https://a.com/x 랑 https://a.com/x")).toHaveLength(1);
  });

  it("링크로 인정하지 않는 토큰은 칠하지 않는다", () => {
    // extractLinks와 동일한 게이팅을 공유해야 한다 — 어긋나면 "색은 칠해졌는데
    // 열기 버튼에는 없는" 상태가 된다.
    for (const text of ["setup.sh 실행", "example.com 확인", "javascript:alert(1)"]) {
      expect(toDescriptionSegments(text).some((s) => s.isLink)).toBe(false);
      expect(extractLinks(text)).toHaveLength(0);
    }
  });

  it("조각을 순서대로 이으면 원문과 정확히 일치한다", () => {
    // 오버레이가 textarea와 같은 줄바꿈을 얻으려면 이 성질이 절대 깨지면 안 된다.
    const samples = [
      "시작 https://a.com/x 중간 https://b.com 끝",
      "https://a.com/x\n두 번째 줄\n\n네 번째 줄",
      "링크 없는 평범한 설명",
      "끝에 개행\n",
      "(참고: https://a.com) 그리고 setup.sh",
    ];
    for (const text of samples) {
      expect(toDescriptionSegments(text).map((s) => s.text).join("")).toBe(text);
    }
  });

  it("원문 대신 정규화된 URL을 넣지 않는다", () => {
    // href는 https로 보정되지만 화면에 겹쳐 그리는 텍스트는 사용자가 친 그대로여야 한다.
    // 다르면 오버레이와 textarea의 글자 수가 달라져 정렬이 깨진다.
    const [segment] = toDescriptionSegments("www.example.com");
    expect(segment).toEqual({ text: "www.example.com", isLink: true });
    expect(extractLinks("www.example.com")[0].href).toBe("https://www.example.com/");
  });

  it("링크 판정이 extractLinks와 항상 일치한다", () => {
    // 두 함수가 갈라지면 "본문은 칠해졌는데 열기 버튼에는 안 뜨는" 어긋남이 생긴다.
    const samples = [
      "https://a.com/x 하나",
      "setup.sh 와 demo.zip",
      "www.example.com 그리고 example.com",
      "메일 a@b.com 과 https://c.com",
      "링크 없음",
    ];
    for (const text of samples) {
      const highlighted = toDescriptionSegments(text).some((s) => s.isLink);
      expect(highlighted).toBe(extractLinks(text).length > 0);
    }
  });
});
