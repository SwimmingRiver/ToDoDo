import { useEffect } from "react";
import * as Sentry from "@sentry/react";
import { useToast } from "@/shared/ui/toast/useToast";
import { subscribeForegroundMessages } from "../push/pushClient";

export const useForegroundReminders = (): void => {
  const toast = useToast();

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    subscribeForegroundMessages(({ title, body }) => toast.info(title, body))
      .then((off) => {
        if (cancelled) off();
        else unsubscribe = off;
      })
      .catch((error) => Sentry.captureException(error));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // toast 객체 정체성에 따라 재구독하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
