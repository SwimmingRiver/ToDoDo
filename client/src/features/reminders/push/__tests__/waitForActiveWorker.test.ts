import { describe, it, expect, vi, afterEach } from "vitest";
import { waitForActiveWorker, SW_ACTIVATION_TIMEOUT_MS } from "../waitForActiveWorker";

/** statechange를 흉내 내는 최소 ServiceWorker. */
const makeWorker = (state: string) => {
  const target = new EventTarget() as EventTarget & { state: string };
  target.state = state;
  return target;
};
const activate = (worker: ReturnType<typeof makeWorker>) => {
  worker.state = "activated";
  worker.dispatchEvent(new Event("statechange"));
};

afterEach(() => vi.useRealTimers());

describe("waitForActiveWorker", () => {
  it("이미 활성이면 바로 끝난다", async () => {
    await expect(
      waitForActiveWorker({ active: makeWorker("activated") } as unknown as ServiceWorkerRegistration),
    ).resolves.toBeUndefined();
  });

  // 운영 Sentry TODODO-CLIENT-2: 등록 직후(installing) getToken → "no active Service Worker"
  it("설치 중이면 activated가 될 때까지 기다린다", async () => {
    const installing = makeWorker("installing");
    let done = false;
    const promise = waitForActiveWorker({ active: null, installing } as unknown as ServiceWorkerRegistration).then(
      () => {
        done = true;
      },
    );
    await Promise.resolve();
    expect(done).toBe(false);
    activate(installing);
    await promise;
    expect(done).toBe(true);
  });

  it("대기(waiting) 중인 워커도 기다린다", async () => {
    const waiting = makeWorker("installed");
    const promise = waitForActiveWorker({ active: null, waiting } as unknown as ServiceWorkerRegistration);
    activate(waiting);
    await expect(promise).resolves.toBeUndefined();
  });

  it("끝내 활성화되지 않으면 타임아웃 에러", async () => {
    vi.useFakeTimers();
    const promise = waitForActiveWorker({
      active: null,
      installing: makeWorker("installing"),
    } as unknown as ServiceWorkerRegistration);
    const assertion = expect(promise).rejects.toThrow("활성화되지 않았");
    await vi.advanceTimersByTimeAsync(SW_ACTIVATION_TIMEOUT_MS);
    await assertion;
  });

  it("설치 중인 워커가 redundant가 되면 실패한다", async () => {
    const installing = makeWorker("installing");
    const promise = waitForActiveWorker({ active: null, installing } as unknown as ServiceWorkerRegistration);
    installing.state = "redundant";
    installing.dispatchEvent(new Event("statechange"));
    await expect(promise).rejects.toThrow("redundant");
  });
});
