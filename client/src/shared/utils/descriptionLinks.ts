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
    // find()는 email 등도 함께 반환한다. 지금 "열기"를 제공할 대상은 URL뿐이다.
    if (token.type !== "url") continue;
    if (!EXPLICIT_LINK.test(token.value)) continue;

    let url: URL;
    try {
      url = new URL(token.href);
    } catch {
      continue;
    }

    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) continue;
    if (seen.has(url.href)) continue;

    seen.add(url.href);
    links.push({ href: url.href, label: url.hostname.replace(/^www\./i, "") });
  }

  return links;
};

export type { DetectedLink };
