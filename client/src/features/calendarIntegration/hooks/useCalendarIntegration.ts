import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { useIsPremium } from "@/features/entitlement";
import { getOAuthStartUrl, disconnectCalendar } from "../api";

interface CalendarIntegrationStatus {
  connected: boolean;
  status: "active" | "revoked";
}

const getIntegrationDocRef = (uid: string) => doc(db, "calendarIntegrations", uid);

export const useCalendarIntegrationStatus = () => {
  const uid = auth.currentUser?.uid;
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

export const useConnectCalendar = () => ({
  connect: async () => {
    const authUrl = await getOAuthStartUrl();
    window.location.href = authUrl;
  },
});

export interface DisconnectTodoRef {
  id: string;
  googleEventId: string;
}

export const useDisconnectCalendar = () => {
  const queryClient = useQueryClient();
  return {
    /** 반환하는 allDeleted가 false면 일부 이벤트가 구글 캘린더에 여전히
     *  남아있을 수 있다는 뜻이다 — 호출부는 이 경우 "연동 해제 완료"라고
     *  단정하지 말고 사용자에게 알려야 한다. */
    disconnect: async (
      todosWithEvent: DisconnectTodoRef[],
      // Todo 문서는 이미 없는데 스냅샷에만 남은 이벤트 — 구글에서는 지워야 하지만
      // Firestore 정리 대상엔 넣지 않는다(문서가 없어 batch.update가 실패한다).
      orphanGoogleEventIds: string[] = [],
    ): Promise<{ allDeleted: boolean }> => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");
      const googleEventIds = [...todosWithEvent.map((t) => t.googleEventId), ...orphanGoogleEventIds];
      const { deletedGoogleEventIds } = await disconnectCalendar(googleEventIds);

      // 실제로 삭제 확인된 것만 Firestore에서 googleEventId를 지운다 — 실패한
      // (구글에 여전히 남아있는) 이벤트의 id까지 지우면 다음 연동부터는 그
      // 이벤트를 추적할 방법이 없어져 영원히 고아로 남는다.
      const deletedSet = new Set(deletedGoogleEventIds);
      const toClear = todosWithEvent.filter((t) => deletedSet.has(t.googleEventId));
      if (toClear.length > 0) {
        const batch = writeBatch(db);
        toClear.forEach((t) => batch.update(doc(db, "todos", t.id), { googleEventId: null }));
        await batch.commit();
      }

      await setDoc(
        getIntegrationDocRef(uid),
        { connected: false, status: "active" },
        { merge: true },
      );
      // 연동 상태가 disconnected로 확정된 뒤에 todos를 무효화한다 — 순서가
      // 뒤집히면 동기화 훅이 캐시된 connected:true를 보고, googleEventId가
      // 비워진 Todo 전부를 upsert하러 나가 Worker 409(토큰 이미 삭제)를 맞는다.
      await queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
      if (toClear.length > 0) queryClient.invalidateQueries({ queryKey: ["todos"] });
      // enabled가 connected 기준이라 무효화만으로는 재조회가 안 일어나 캐시가
      // 그대로 남는다 — 연동 해제 뒤 화면에 이미 지워졌을 수도 있는 옛 구글
      // 이벤트가 "유령"처럼 계속 보이는 걸 막기 위해 캐시 자체를 지운다.
      queryClient.removeQueries({ queryKey: ["googleCalendarEvents"] });

      return { allDeleted: deletedGoogleEventIds.length === googleEventIds.length };
    },
  };
};

export const useMarkCalendarConnected = () => {
  const queryClient = useQueryClient();
  return {
    markConnected: async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");
      await setDoc(
        getIntegrationDocRef(uid),
        { connected: true, connectedAt: new Date().toISOString(), status: "active" },
        { merge: true },
      );
      queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
    },
  };
};
