import type { LegalConfig, LegalRevision } from "../config";

interface RevisionSummary {
  effectiveDate: string;
  change: string;
}

interface ResolvedLegalRevision {
  current: LegalConfig;
  /** 아직 시행 전인 가장 가까운 다음 판. 문서 상단 변경 예정 공지에 쓴다. */
  upcoming?: RevisionSummary;
  /** 시행된 판들, 오래된 순. */
  history: RevisionSummary[];
}

const seoulFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 시행일은 한국 기준이므로 사용자 기기 시간대가 아니라 서울 날짜로 비교한다.
 * en-CA 로캘은 "YYYY-MM-DD"로 포맷돼 effectiveOn과 문자열 비교가 된다.
 */
export const seoulDateKey = (now: Date): string => seoulFormatter.format(now);

export const formatEffectiveOn = (effectiveOn: string): string => {
  if (effectiveOn === "") return "";
  const [year, month, day] = effectiveOn.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
};

const summarize = (revision: LegalRevision): RevisionSummary => ({
  effectiveDate: formatEffectiveOn(revision.effectiveOn),
  change: revision.change,
});

/**
 * 판별 본문 중 오늘(서울) 시행 중인 것을 고른다. 판 정보(LEGAL_REVISIONS)와 같은 날짜 기준이라
 * 시행일이 되면 판매자 표기와 본문이 함께, 배포 없이 바뀐다.
 * 첫 본문 시행 전(이론상만 가능)에도 빈 화면 대신 첫 본문을 보여준다.
 */
export const resolveLegalEdition = <T>(
  editions: readonly { effectiveOn: string; document: T }[],
  now: Date,
): T => {
  const today = seoulDateKey(now);
  const effective = editions.filter((e) => e.effectiveOn <= today);
  return (effective.at(-1) ?? editions[0]).document;
};

export const resolveLegalRevision = (
  revisions: LegalRevision[],
  now: Date,
): ResolvedLegalRevision => {
  const today = seoulDateKey(now);
  const effective = revisions.filter((r) => r.effectiveOn <= today);
  // 첫 판 시행 전(이론상만 가능)에도 빈 화면 대신 첫 판을 보여준다.
  const currentRevision = effective.at(-1) ?? revisions[0];
  const upcomingRevision = revisions.find((r) => r.effectiveOn > today);

  return {
    current: { ...currentRevision.config, effectiveDate: formatEffectiveOn(currentRevision.effectiveOn) },
    upcoming: upcomingRevision ? summarize(upcomingRevision) : undefined,
    history: effective.map(summarize),
  };
};
