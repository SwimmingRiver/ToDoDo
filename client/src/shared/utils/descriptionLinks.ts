import { find } from "linkifyjs";

/**
 * description 최대 길이.
 * firestore.rules의 검증 값과 반드시 동일하게 유지해야 한다(둘 중 하나만 바꾸면
 * 클라이언트는 통과시키는데 서버가 거부하는 상태가 된다).
 */
export const DESCRIPTION_MAX_LENGTH = 2000;

/**
 * 링크로 인정할 스킴 화이트리스트.
 * denylist("javascript:를 막는다")가 아니라 allowlist인 이유는, 새 스킴이 생기거나
 * 인코딩 우회가 나와도 목록에 없으면 자동으로 막히기 때문이다.
 */
const ALLOWED_PROTOCOLS: readonly string[] = ["http:", "https:"];

/**
 * linkify는 TLD 목록만 보고 판정하므로 setup.sh / demo.zip / clip.mov 같은 파일명도
 * 링크로 잡는다(.sh .zip .mov 모두 실제 TLD다). 스킴이나 www.를 명시한 경우만
 * "사용자가 링크로 적은 것"으로 인정해 오탐을 없앤다.
 */
const EXPLICIT_LINK = /^(https?:\/\/|www\.)/i;

interface DetectedLink {
  /** 실제로 열 URL(정규화된 절대 URL) */
  href: string;
  /** 버튼에 노출할 짧은 라벨 — 호스트명에서 www. 를 뗀 형태 */
  label: string;
}

/** description을 링크/비링크 구간으로 쪼갠 조각. 하이라이트 렌더링용. */
interface DescriptionSegment {
  text: string;
  isLink: boolean;
}

type LinkifyMatch = ReturnType<typeof find>[number];

/**
 * "열어도 되는 링크"의 단일 판정 지점.
 *
 * extractLinks(열기 버튼)와 toDescriptionSegments(본문 하이라이트)가 반드시 이 함수를
 * 공유해야 한다. 두 곳이 갈라지면 "색은 칠해졌는데 버튼에는 안 뜨는" 어긋남이 생기고,
 * 그건 그 자체로 버그다.
 */
const toAllowedUrl = (token: LinkifyMatch): URL | null => {
  if (token.type !== "url") return null;
  if (!EXPLICIT_LINK.test(token.value)) return null;

  try {
    const url = new URL(token.href);
    return ALLOWED_PROTOCOLS.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
};

/**
 * plain text description에서 열 수 있는 링크를 뽑아낸다.
 *
 * 저장 형식은 그대로 string이고, 감지는 이 함수를 호출하는 렌더링 시점에만 일어난다.
 * 정규식 대신 linkify를 쓰는 이유는 경계 판정 때문이다 — "https://a.com. 확인"의
 * 마지막 마침표는 문장부호지만 "https://a.com/x." 의 마침표는 경로의 일부일 수 있고,
 * "(참고: https://a.com)"의 닫는 괄호는 URL이 아니지만 위키백과 URL의 괄호는 URL이다.
 * 상태 없는 정규식으로는 이 구분이 되지 않는다.
 */
export const extractLinks = (text?: string | null): DetectedLink[] => {
  if (!text) return [];

  const seen = new Set<string>();
  const links: DetectedLink[] = [];

  for (const token of find(text, { defaultProtocol: "https" })) {
    const url = toAllowedUrl(token);
    if (!url) continue;
    // 같은 URL이 두 번 적혀 있어도 열기 버튼은 하나면 충분하다.
    // (본문 하이라이트는 요구가 정반대라 toDescriptionSegments에서 중복 제거를 하지 않는다.)
    if (seen.has(url.href)) continue;

    seen.add(url.href);
    links.push({ href: url.href, label: url.hostname.replace(/^www\./i, "") });
  }

  return links;
};

/**
 * description을 링크/비링크 구간으로 쪼갠다. 본문 하이라이트 렌더링용.
 *
 * extractLinks와 달리 (1) 원문 내 위치를 보존하고 (2) 같은 URL이 여러 번 나오면
 * 그 횟수만큼 반환한다 — 본문에 두 번 적힌 URL은 두 곳 다 칠해져야 하기 때문이다.
 * 반환된 text 조각을 순서대로 이으면 원문과 정확히 일치한다(하이라이트 오버레이가
 * textarea와 같은 줄바꿈을 얻으려면 이 성질이 깨지면 안 된다).
 */
export const toDescriptionSegments = (text?: string | null): DescriptionSegment[] => {
  if (!text) return [];

  const segments: DescriptionSegment[] = [];
  let cursor = 0;

  for (const token of find(text, { defaultProtocol: "https" })) {
    if (!toAllowedUrl(token)) continue;

    if (token.start > cursor) {
      segments.push({ text: text.slice(cursor, token.start), isLink: false });
    }
    segments.push({ text: text.slice(token.start, token.end), isLink: true });
    cursor = token.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isLink: false });
  }

  return segments;
};

export type { DetectedLink, DescriptionSegment };
