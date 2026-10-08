/**
 * 푸터·드로어·요금제 섹션이 쓰는 링크. 순서가 화면 표시 순서다.
 * 문서 본문(terms/privacy/refund)을 import하지 않는다 — 푸터가 모든 화면에 실리므로
 * 본문을 끌어오면 약관 전문이 공유 청크에 들어간다. 라벨이 문서 제목과 같은지는 content 테스트가 지킨다.
 */
export const LEGAL_LINKS: readonly { to: string; label: string }[] = [
  { to: "/terms", label: "이용약관" },
  { to: "/privacy", label: "개인정보처리방침" },
  { to: "/refund", label: "환불 정책" },
];
