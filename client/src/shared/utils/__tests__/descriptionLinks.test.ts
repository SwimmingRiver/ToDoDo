import { describe, it, expect } from "vitest";
import { extractLinks, DESCRIPTION_MAX_LENGTH } from "../descriptionLinks";

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

  it("DESCRIPTION_MAX_LENGTH는 firestore.rules의 상한과 같은 2000이다", () => {
    // 한쪽만 바뀌면 클라이언트는 통과시키는데 서버가 거부하는 상태가 된다.
    expect(DESCRIPTION_MAX_LENGTH).toBe(2000);
  });
});
