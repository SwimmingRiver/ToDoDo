import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "firebase/auth";
import { linkedNoticeKey, linkedNoticeStorageKey } from "@tododo/core/dist/auth/index.js";

// 계정이 둘 이상의 방법으로 연결된 뒤 안내를 한 번만 보여주기 위한 기록(웹과 같은 규칙). 보여줘야 하면 true.
// 저장소가 실패하면 안내만 생략한다.
export const consumeLinkedNotice = async (user: User): Promise<boolean> => {
  try {
    const key = linkedNoticeKey(user.providerData.map((p) => p.providerId));
    if (!key) return false;
    const storageKey = linkedNoticeStorageKey(user.uid);
    if ((await AsyncStorage.getItem(storageKey)) === key) return false;
    await AsyncStorage.setItem(storageKey, key);
    return true;
  } catch {
    return false;
  }
};
