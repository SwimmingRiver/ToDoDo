import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import * as WebBrowser from "expo-web-browser";
import type { CalendarIntegrationStatus } from "@tododo/core/dist/calendarSync/index.js";
import { db } from "../firebase";
import { useAuthState } from "../auth/useAuthState";
import { useIsPremium } from "../premium";
import { disconnectCalendar, getOAuthStartUrl } from "./calendarProxyApi";

/** Worker 콜백이 302로 돌려보내는 앱 딥링크(app.json scheme "tododo"). */
export const CALENDAR_REDIRECT_URL = "tododo://calendar";

const getIntegrationDocRef = (uid: string) => doc(db, "calendarIntegrations", uid);

export const useCalendarIntegrationStatus = () => {
  const { user } = useAuthState();
  const uid = user?.uid;
  const { isPremium } = useIsPremium();
  return useQuery({
    queryKey: ["calendarIntegration", uid],
    queryFn: async (): Promise<CalendarIntegrationStatus> => {
      if (!uid) throw new Error("Not authenticated");
      const snap = await getDoc(getIntegrationDocRef(uid));
      if (!snap.exists()) return { connected: false, status: "active" };
      const data = snap.data() as Partial<CalendarIntegrationStatus>;
      return { connected: !!data.connected, status: data.status ?? "active" };
    },
    enabled: !!uid && isPremium,
  });
};

export type ConnectCalendarResult = "connected" | "cancelled" | "error" | "saveFailed";

/** 딥링크 쿼리를 직접 읽는다 — RN의 URL 폴리필은 searchParams가 미구현이다.
 *  찾는 키가 고정된 ASCII라 디코딩하지 않는다(깨진 % 시퀀스로 throw할 여지를 없앤다).
 *  어떤 입력에도 throw하지 않고, 알아볼 수 없으면 빈 집합 → 호출부에서 "error". */
const readCallbackParams = (url: string): Set<string> => {
  const query = url.split("?")[1]?.split("#")[0] ?? "";
  const flags = new Set<string>();
  for (const pair of query.split("&")) {
    const [key, value] = pair.split("=");
    if (key && value === "1") flags.add(key);
  }
  return flags;
};

export const useConnectCalendar = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();
  return {
    connect: async (): Promise<ConnectCalendarResult> => {
      const uid = user?.uid;
      if (!uid) return "error";
      let result: WebBrowser.WebBrowserAuthSessionResult;
      try {
        const authUrl = await getOAuthStartUrl();
        result = await WebBrowser.openAuthSessionAsync(authUrl, CALENDAR_REDIRECT_URL);
      } catch (error) {
        console.warn("[calendar] 연결 시작 실패", error);
        return "error";
      }
      // 사용자가 닫은 경우만 취소로 본다. Android의 locked/opened 등 다른 비성공 결과는
      // 실패를 숨기지 않도록 error로 돌린다.
      if (result.type === "cancel" || result.type === "dismiss") return "cancelled";
      if (result.type !== "success") return "error";
      const flags = readCallbackParams(result.url);
      if (flags.has("calendarCancelled")) return "cancelled";
      if (!flags.has("calendarConnected")) return "error";

      // 토큰은 Worker가 이미 저장했다. 연동 문서 쓰기가 실패하면 상태가 미연동으로 보이므로
      // 호출부가 "다시 시도"를 안내할 수 있게 별도 결과로 구분한다.
      try {
        await setDoc(
          getIntegrationDocRef(uid),
          { connected: true, connectedAt: new Date().toISOString(), status: "active" },
          { merge: true },
        );
      } catch (error) {
        console.warn("[calendar] 연동 상태 저장 실패", error);
        return "saveFailed";
      }
      await queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
      return "connected";
    },
  };
};

export interface DisconnectTodoRef {
  id: string;
  googleEventId: string;
}

export const useDisconnectCalendar = () => {
  const { user } = useAuthState();
  const queryClient = useQueryClient();
  return {
    /** 반환하는 allDeleted가 false면 일부 이벤트가 구글 캘린더에 여전히 남아있을 수 있다는
     *  뜻이다 — 호출부는 이 경우 "연동 해제 완료"라고 단정하지 말고 사용자에게 알려야 한다. */
    disconnect: async (
      todosWithEvent: DisconnectTodoRef[],
      // Todo 문서는 이미 없는데 스냅샷에만 남은 이벤트 — 구글에서는 지워야 하지만
      // Firestore 정리 대상엔 넣지 않는다(문서가 없어 batch.update가 실패한다).
      orphanGoogleEventIds: string[] = [],
    ): Promise<{ allDeleted: boolean }> => {
      const uid = user?.uid;
      if (!uid) throw new Error("Not authenticated");
      const googleEventIds = [...todosWithEvent.map((t) => t.googleEventId), ...orphanGoogleEventIds];
      const { deletedGoogleEventIds } = await disconnectCalendar(googleEventIds);

      // 실제로 삭제 확인된 것만 Firestore에서 googleEventId를 지운다 — 실패한(구글에 여전히
      // 남아있는) 이벤트의 id까지 지우면 다음 연동부터는 그 이벤트를 추적할 방법이 없어진다.
      const deletedSet = new Set(deletedGoogleEventIds);
      const toClear = todosWithEvent.filter((t) => deletedSet.has(t.googleEventId));
      if (toClear.length > 0) {
        const batch = writeBatch(db);
        toClear.forEach((t) => batch.update(doc(db, "todos", t.id), { googleEventId: null }));
        await batch.commit();
      }

      await setDoc(getIntegrationDocRef(uid), { connected: false, status: "active" }, { merge: true });
      // 연동 상태가 disconnected로 확정된 뒤에 todos를 무효화한다 — 순서가 뒤집히면 동기화 훅이
      // 캐시된 connected:true를 보고, googleEventId가 비워진 Todo 전부를 upsert하러 나가
      // Worker 409(토큰 이미 삭제)를 맞는다.
      await queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
      if (toClear.length > 0) queryClient.invalidateQueries({ queryKey: ["todos", uid] });
      // enabled가 connected 기준이라 무효화만으로는 재조회가 안 일어나 캐시가 그대로 남는다 —
      // 이미 지워졌을 수도 있는 옛 구글 이벤트가 "유령"처럼 계속 보이지 않게 캐시 자체를 지운다.
      queryClient.removeQueries({ queryKey: ["googleCalendarEvents"] });

      return { allDeleted: deletedGoogleEventIds.length === googleEventIds.length };
    },
  };
};
