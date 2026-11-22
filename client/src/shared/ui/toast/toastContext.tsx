import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import Toast, { type ToastData, type ToastType } from "./toast";
import { ToastContext } from "./toastTypes";

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  // 자동 닫힘·퇴장 타이머. Provider가 사라진 뒤 타이머가 setState하지 않도록 언마운트 때
  // 전부 지운다(테스트 환경 정리 뒤 실행되면 'window is not defined'로 CI가 실패했다).
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const schedule = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, ms);
    timersRef.current.add(timer);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id ? { ...toast, isExiting: true } : toast
      )
    );

    schedule(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 300);
  }, [schedule]);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, duration = 3000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: ToastData = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      schedule(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast, schedule]
  );

  const success = useCallback(
    (title: string, message?: string) => showToast("success", title, message),
    [showToast]
  );

  const error = useCallback(
    (title: string, message?: string) => showToast("error", title, message),
    [showToast]
  );

  const warning = useCallback(
    (title: string, message?: string) => showToast("warning", title, message),
    [showToast]
  );

  const info = useCallback(
    (title: string, message?: string) => showToast("info", title, message),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      <Toast toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};
