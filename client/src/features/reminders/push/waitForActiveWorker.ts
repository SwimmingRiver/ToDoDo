export const SW_ACTIVATION_TIMEOUT_MS = 10_000;

/**
 * 서비스 워커 등록이 활성화될 때까지 기다린다.
 *
 * register() 직후의 워커는 installing 상태라, 이때 getToken(→ pushManager.subscribe)을 부르면
 * "Subscription failed - no active Service Worker"로 실패한다. Firebase SDK는 자기가 등록하는
 * 기본 워커에만 이 대기(waitForRegistrationActive)를 적용하고, serviceWorkerRegistration을
 * 직접 넘기면 기다리지 않는다 — 그래서 우리가 기다린다.
 */
export const waitForActiveWorker = (registration: ServiceWorkerRegistration): Promise<void> => {
  if (registration.active) return Promise.resolve();
  const incoming = registration.installing ?? registration.waiting;
  if (!incoming) return Promise.reject(new Error("활성화를 기다릴 서비스 워커가 없습니다"));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      incoming.removeEventListener("statechange", onStateChange);
      reject(new Error(`서비스 워커가 ${SW_ACTIVATION_TIMEOUT_MS}ms 안에 활성화되지 않았습니다`));
    }, SW_ACTIVATION_TIMEOUT_MS);

    function onStateChange() {
      if (incoming!.state === "activated") {
        clearTimeout(timer);
        incoming!.removeEventListener("statechange", onStateChange);
        resolve();
      } else if (incoming!.state === "redundant") {
        clearTimeout(timer);
        incoming!.removeEventListener("statechange", onStateChange);
        reject(new Error("서비스 워커 설치가 실패했습니다(redundant)"));
      }
    }

    incoming.addEventListener("statechange", onStateChange);
  });
};
