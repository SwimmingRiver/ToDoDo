/**
 * 샌드박스 기간 게이트. 운영 Firestore가 샌드박스 결제에 연결되므로 공개 테스트 카드로
 * 누구나 프리미엄을 얻지 못하게 막는다. 설정 누락이 게이트 개방으로 이어지지 않도록
 * 비어 있으면 아무도 허용하지 않고, 전원 허용은 정확히 "*"일 때만이다.
 */
export const isBillingAllowed = (uid: string, raw: string | undefined): boolean => {
  const value = (raw ?? "").trim();
  if (value === "*") return true;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .includes(uid);
};
