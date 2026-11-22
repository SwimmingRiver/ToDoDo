import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import Toast, { type ToastData, type ToastType } from "./toast";
import { ToastContext } from "./toastTypes";

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  // 자동 닫힘(auto:)·퇴장(exit:) 타이머를 키별로 관리한다. Provider가 사라진 뒤 타이머가
  // setState하면 테스트 환경 정리 뒤 'window is not defined'로 CI가 실패했다 → 언마운트 때 멈춘다.
  // 단, 멈추기만 하고 실행 시각(due)은 남겨 effect가 다시 돌면 남은 시간으로 다시 건다 —
  // StrictMode는 첫 마운트 뒤 정리를 한 번 재생하므로, 지워 버리면 자식이 첫 마운트 effect로
  // 띄운 토스트가 영영 안 닫힌다.
  const pendingRef = useRef(
    new Map<string, { fn: () => void; due: number; handle?: ReturnType<typeof setTimeout> }>(),
  );

  const arm = useCallback((key: string) => {
    const entry = pendingRef.current.get(key);
    if (!entry) return;
    entry.handle = setTimeout(() => {
      pendingRef.current.delete(key);
      entry.fn();
    }, Math.max(0, entry.due - Date.now()));
  }, []);

  const cancel = useCallback((key: string) => {
    const entry = pendingRef.current.get(key);
    if (entry?.handle !== undefined) clearTimeout(entry.handle);
    pendingRef.current.delete(key);
  }, []);

  const schedule = useCallback(
    (key: string, fn: () => void, ms: number) => {
      cancel(key);
      pendingRef.current.set(key, { fn, due: Date.now() + ms });
      arm(key);
    },
    [arm, cancel],
  );

  useEffect(() => {
    const pending = pendingRef.current;
    pending.forEach((entry, key) => {
      if (entry.handle === undefined) arm(key);
    });
    return () => {
      pending.forEach((entry) => {
        if (entry.handle !== undefined) clearTimeout(entry.handle);
        entry.handle = undefined;
      });
    };
  }, [arm]);

  const removeToast = useCallback((id: string) => {
    // 직접 닫은 경우 남은 자동 닫힘 타이머가 나중에 헛돌지 않게 취소한다.
    cancel(`auto:${id}`);
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id ? { ...toast, isExiting: true } : toast
      )
    );

    schedule(`exit:${id}`, () => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 300);
  }, [cancel, schedule]);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, duration = 3000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: ToastData = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      schedule(`auto:${id}`, () => {
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
