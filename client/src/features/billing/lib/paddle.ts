import { PADDLE_CLIENT_TOKEN, PADDLE_ENV } from "../config";

const PADDLE_SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

export interface PaddleEvent {
  name: string;
}

export interface PaddleJs {
  Environment: { set: (env: "sandbox") => void };
  Initialize: (options: { token: string; eventCallback: (event: PaddleEvent) => void }) => void;
  Checkout: { open: (options: { transactionId: string }) => void; close: () => void };
}

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

const listeners = new Set<(event: PaddleEvent) => void>();
let loading: Promise<PaddleJs> | null = null;

/** Paddle.Initialize는 한 번만 부를 수 있어 이벤트를 여기서 받아 구독자들에게 나눠 준다. */
export const onPaddleEvent = (listener: (event: PaddleEvent) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 결제 버튼을 누른 순간에만 스크립트를 받는다 — 결제하지 않는 사용자의 번들 비용은 0이다. */
export const loadPaddle = (): Promise<PaddleJs> => {
  if (loading) return loading;
  loading = new Promise<PaddleJs>((resolve, reject) => {
    if (!PADDLE_CLIENT_TOKEN) {
      reject(new Error("VITE_PADDLE_CLIENT_TOKEN이 설정되지 않았습니다"));
      return;
    }
    const script = document.createElement("script");
    script.src = PADDLE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        reject(new Error("Paddle.js 로드 후 window.Paddle이 없습니다"));
        return;
      }
      if (PADDLE_ENV === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({
        token: PADDLE_CLIENT_TOKEN,
        eventCallback: (event) => listeners.forEach((listener) => listener(event)),
      });
      resolve(paddle);
    };
    script.onerror = () => reject(new Error("Paddle.js를 불러오지 못했습니다"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null; // 다음 클릭에서 다시 시도할 수 있게
    throw error;
  });
  return loading;
};
