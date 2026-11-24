/**
 * 기존 커스텀 클레임에 운영자(operator) 클레임을 부여하거나 회수한 새 객체를 돌려준다.
 * premiumUntil 같은 다른 클레임은 보존하고, 레거시 premium 키는 grantEntitlement와 같이 버린다.
 */
export const mergeOperatorClaim = (
  existing: Record<string, unknown> | undefined,
  grant: boolean,
): Record<string, unknown> => {
  const { premium: _legacy, operator: _operator, ...rest } = existing ?? {};
  return grant ? { ...rest, operator: true } : rest;
};
