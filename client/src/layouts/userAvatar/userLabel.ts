import type { User } from "firebase/auth";

/** 표시 이름 → 이메일 앞부분 → "사용자" 순으로 대체한다(Apple은 이름·이메일이 없을 수 있다). */
export const userLabel = (user: Pick<User, "displayName" | "email"> | null): string => {
  const name = user?.displayName?.trim();
  if (name) return name;
  const local = user?.email?.split("@")[0]?.trim();
  return local || "사용자";
};
