import { createNavigationContainerRef } from "@react-navigation/native";
import { addLifecycleBreadcrumb, addNavigationBreadcrumb } from "../shared/lib/sentry";

export const navigationRef = createNavigationContainerRef();

// 컨테이너가 준비되기 전(콜드 스타트로 알림을 눌러 열린 경우)에 들어온 이동은 한 건만 보류한다.
let pendingTodoId: string | null = null;

const navigateToTodoDetail = (todoId: string): void => {
  // 루트 ParamList를 따로 선언하지 않아 navigate 인자가 never로 좁혀진다. 탭 이름은 RootNavigator의 Tab.Screen과 같다.
  (navigationRef.navigate as (name: string, params: object) => void)("오늘", {
    screen: "TodoDetail",
    params: { id: todoId },
  });
};

export const openTodoDetail = (todoId: string): void => {
  if (!navigationRef.isReady()) {
    pendingTodoId = todoId;
    return;
  }
  navigateToTodoDetail(todoId);
};

/** NavigationContainer onReady에서 부른다. 보류된 이동이 있으면 한 번만 실행한다. */
export const flushPendingTodoDetail = (): void => {
  if (pendingTodoId === null) return;
  const id = pendingTodoId;
  pendingTodoId = null;
  navigateToTodoDetail(id);
};

// 마지막으로 breadcrumb을 남긴 화면 이름. 같은 화면 안의 상태 변경(params 갱신 등)은 남기지 않는다.
let lastRouteName: string | undefined;

const recordRoute = (): void => {
  // 루트 ParamList를 선언하지 않아 route 타입이 never로 좁혀진다(위 navigate와 같은 이유).
  const name = (navigationRef.getCurrentRoute() as { name?: string } | undefined)?.name;
  if (!name || name === lastRouteName) return;
  addNavigationBreadcrumb(lastRouteName, name);
  lastRouteName = name;
};

/** NavigationContainer onReady. 보류된 알림 이동을 실행하고 첫 화면을 breadcrumb으로 남긴다. */
export const onNavigationReady = (): void => {
  addLifecycleBreadcrumb("nav_ready");
  recordRoute();
  flushPendingTodoDetail();
};

/** NavigationContainer onStateChange. 화면이 바뀌면 이름만(from/to) breadcrumb으로 남긴다. */
export const onNavigationStateChange = (): void => {
  recordRoute();
};
