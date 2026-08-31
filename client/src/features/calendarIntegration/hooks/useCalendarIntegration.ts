import { useQuery, useQueryClient } from "@tanstack/react-query";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/shared/lib/firestore";
import { auth } from "@/shared/lib/firebase";
import { getOAuthStartUrl, disconnectCalendar } from "../api";

// 지금은 전원 무료 제공. 유료 전환을 결정하면 실제 구독 상태 체크로 교체한다.
const isCalendarIntegrationUnlocked = true;

interface CalendarIntegrationStatus {
  connected: boolean;
  status: "active" | "revoked";
}

const getIntegrationDocRef = (uid: string) => doc(db, "calendarIntegrations", uid);

export const useCalendarIntegrationStatus = () => {
  const uid = auth.currentUser?.uid;
  return useQuery({
    queryKey: ["calendarIntegration", uid],
    queryFn: async (): Promise<CalendarIntegrationStatus> => {
      if (!uid) throw new Error("Not authenticated");
      const snap = await getDoc(getIntegrationDocRef(uid));
      if (!snap.exists()) return { connected: false, status: "active" };
      const data = snap.data() as Partial<CalendarIntegrationStatus>;
      return { connected: !!data.connected, status: data.status ?? "active" };
    },
    enabled: !!uid && isCalendarIntegrationUnlocked,
  });
};

export const useConnectCalendar = () => ({
  connect: async () => {
    const authUrl = await getOAuthStartUrl();
    window.location.href = authUrl;
  },
});

export const useDisconnectCalendar = () => {
  const queryClient = useQueryClient();
  return {
    disconnect: async (googleEventIds: string[]) => {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated");
      await disconnectCalendar(googleEventIds);
      await setDoc(
        getIntegrationDocRef(uid),
        { connected: false, status: "active" },
        { merge: true },
      );
      queryClient.invalidateQueries({ queryKey: ["calendarIntegration", uid] });
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
