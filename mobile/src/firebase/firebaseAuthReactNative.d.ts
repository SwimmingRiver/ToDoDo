import type { Persistence, ReactNativeAsyncStorage } from "@firebase/auth";

/**
 * "@firebase/auth"의 exports 맵은 "react-native" 조건 아래 getReactNativePersistence를
 * 실제로 export하지만(dist/rn/index.js), 그 조건의 타입 선언(dist/rn/index.rn.d.ts)은
 * tsc가 조건 없이 먼저 매칭하는 최상위 "types" 필드(dist/auth-public.d.ts)에 가려져
 * 선택되지 않는다. 런타임 값은 실재하므로 타입만 보강한다.
 */
declare module "@firebase/auth" {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
