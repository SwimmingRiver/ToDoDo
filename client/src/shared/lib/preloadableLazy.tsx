import { lazy, useState, type ComponentType } from "react";

/**
 * 미리 받을 수 있는 React.lazy.
 *
 * 왜 필요한가: React.lazy는 모듈이 이미 받아져 있어도 첫 렌더에서 무조건 한 번 suspend한다
 * (import()를 다시 호출해 그 Promise를 기다리기 때문). suspend하면 Suspense fallback이
 * 커밋되고, React 19는 마지막 fallback 커밋 뒤 300ms(FALLBACK_THROTTLE_MS)가 지나야 실제
 * 내용을 커밋한다. 그래서 router.tsx의 preloadSignedInRoute로 청크를 일찍 받아 둬도,
 * 로그인 응답 직후 화면이 ~300ms 늦게 그려졌다(운영 트레이스로 확인).
 *
 * 동작: preload()가 끝나 모듈을 갖고 있으면 lazy를 거치지 않고 컴포넌트를 직접 그린다
 * → suspend·fallback·300ms 대기가 없다. 아직 없으면 기존 React.lazy로 그린다.
 *
 * 직접 그릴지 lazy로 그릴지는 인스턴스가 처음 그려질 때 한 번만 정한다(useState 초기값).
 * 렌더마다 판단하면 도중에 모듈이 도착했을 때 엘리먼트 타입이 바뀌어 하위 트리가 다시
 * 마운트되기 때문이다.
 */
export const preloadableLazy = <P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
) => {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<{ default: ComponentType<P> }> | undefined;

  const preload = () => {
    pending ??= load().then(
      (mod) => {
        loaded = mod.default;
        return mod;
      },
      (error: unknown) => {
        // 실패한 Promise를 붙들고 있으면 이후 preload가 영원히 실패한다 → 다음 호출에서 재시도.
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };

  const Lazy = lazy(preload);

  const Component = (props: P) => {
    const [Direct] = useState(() => loaded);
    return Direct ? <Direct {...props} /> : <Lazy {...props} />;
  };

  return { Component, preload };
};
