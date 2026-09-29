import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Firebase SW SDK가 알림 클릭 시 포커스한 탭에 보내는 메시지 모양(필요한 부분만). */
type NotificationClickMessage = {
  messageType?: string;
  fcmOptions?: { link?: string };
  notification?: { click_action?: string };
  data?: { todoId?: string };
};

const NOTIFICATION_CLICKED = "notification-clicked";

const pathFromLink = (link: string): string | null => {
  try {
    const url = new URL(link, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const targetPath = (message: NotificationClickMessage): string | null => {
  const todoId = message.data?.todoId;
  if (todoId) return `/todo/${encodeURIComponent(todoId)}`;
  const link = message.fcmOptions?.link ?? message.notification?.click_action;
  return link ? pathFromLink(link) : null;
};

/**
 * 앱 탭이 이미 열려 있을 때 알림을 클릭하면 SW SDK는 그 탭을 포커스하고 메시지만
 * 보낼 뿐 이동은 하지 않는다. 여기서 받아 해당 할 일 상세로 라우팅한다.
 */
export const useNotificationClickNavigation = (): void => {
  const navigate = useNavigate();

  useEffect(() => {
    const serviceWorker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!serviceWorker) return;
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as NotificationClickMessage | null;
      if (!message || typeof message !== "object" || message.messageType !== NOTIFICATION_CLICKED) return;
      const path = targetPath(message);
      if (path) navigate(path);
    };
    serviceWorker.addEventListener("message", handleMessage);
    return () => serviceWorker.removeEventListener("message", handleMessage);
  }, [navigate]);
};
