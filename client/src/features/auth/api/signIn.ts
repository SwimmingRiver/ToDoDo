import { browserPopupRedirectResolver, signInWithPopup, updateProfile } from "firebase/auth";
import type { User, UserCredential } from "firebase/auth";
import { formatAppleDisplayName, linkedNoticeKey, linkedNoticeStorageKey } from "@tododo/core/dist/auth/index.js";
import { auth, googleProvider, appleProvider } from "@/shared/lib/firebase";

// auth가 popup 처리기 없이 만들어져(#195) 팝업을 여는 곳마다 처리기를 넘겨야 한다.
export const signInWithGoogle = (): Promise<UserCredential> =>
  signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);

export const signInWithApple = async (): Promise<UserCredential> => {
  const result = await signInWithPopup(auth, appleProvider, browserPopupRedirectResolver);
  await applyAppleName(result);
  return result;
};

// Apple은 이름을 "이름 성" 순서로 주므로 한국어 순서로 보정한다. 바꿨으면 true.
// 어떤 실패도 로그인을 막지 않는다.
export const applyAppleName = async (result: UserCredential): Promise<boolean> => {
  try {
    // SDK 내부 필드 — 공개 API(getAdditionalUserInfo)에 이름 없음, 실측 2026-11-23, spec 참고
    const token = (result as unknown as { _tokenResponse?: { firstName?: unknown; lastName?: unknown } })
      ._tokenResponse;
    const given = typeof token?.firstName === "string" ? token.firstName : null;
    const family = typeof token?.lastName === "string" ? token.lastName : null;
    const name = formatAppleDisplayName(given, family);
    if (!name || name === result.user.displayName) return false;
    await updateProfile(result.user, { displayName: name });
    return true;
  } catch (error) {
    console.error("Apple 이름 보정 실패:", error);
    return false;
  }
};

// 계정이 둘 이상의 방법으로 연결된 뒤 안내를 한 번만 보여주기 위한 기록. 보여줘야 하면 true.
export const consumeLinkedNotice = (user: User): boolean => {
  try {
    const key = linkedNoticeKey(user.providerData.map((p) => p.providerId));
    if (!key) return false;
    const storageKey = linkedNoticeStorageKey(user.uid);
    if (localStorage.getItem(storageKey) === key) return false;
    localStorage.setItem(storageKey, key);
    return true;
  } catch {
    return false;
  }
};
