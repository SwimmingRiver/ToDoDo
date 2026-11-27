import * as Sentry from "@sentry/react-native";
import type { Breadcrumb, ErrorEvent } from "@sentry/react-native";

/**
 * 앱 Sentry 설정. 규칙은 웹(client/src/shared/lib/sentry.ts)과 같다 — 허용한 필드만 보내고,
 * 사용자는 uid만, 운영 빌드에서만 켠다. 웹 코드를 공유하지 않는 이유: 웹은 @sentry/react,
 * 앱은 @sentry/react-native라 이벤트 타입이 다르고, @tododo/core가 Sentry에 의존하지 않게 하기 위해서다.
 *
 * 웹과 다른 점:
 * - contexts.device(기기 모델 등)는 보내지 않는다. 개인정보처리방침이 오류 정보로 "브라우저·OS"까지만
 *   고지하기 때문이다. 대신 os와 app(앱 버전·빌드 번호)을 보낸다.
 * - request는 보내지 않는다(앱에는 페이지 주소·UA 헤더가 없다).
 * - 웹의 WebView 브릿지 노이즈 필터는 웹 전용이라 없다.
 *
 * 한계: 네이티브(iOS/Android) 크래시는 네이티브 SDK가 다음 실행 때 직접 보내므로 이 beforeSend를
 * 거치지 않는다 — 기기 정보가 담길 수 있다. breadcrumb은 beforeBreadcrumb로 기록 시점에 걸러
 * 네이티브 쪽에도 허용된 것만 남는다.
 *
 * 새 민감 필드가 이벤트에 들어갈 일이 생기면 여기 허용 목록에 명시적으로 추가해야 보인다(기본은 차단).
 */

// 기계적으로 생기는 breadcrumb만 허용한다. touch(누른 요소의 라벨)·console(로그 인자)은 할 일 제목 등
// 사용자 입력이 섞일 수 있어 통째로 뺀다. app.lifecycle은 앱 코드가 고정 값으로만 남기는 진행 단계다.
const LIFECYCLE_CATEGORY = "app.lifecycle";
const ALLOWED_BREADCRUMB_CATEGORIES = new Set(["navigation", "fetch", "xhr", LIFECYCLE_CATEGORY]);

const ALLOWED_BREADCRUMB_DATA_KEYS = new Set([
  "url",
  "method",
  "status_code",
  "from",
  "to",
  "request_body_size",
  "response_body_size",
  // app.lifecycle 전용. 값은 아래 LifecycleStage·reason·boolean 같은 고정 값뿐이다.
  "stage",
  "reason",
  "signed_in",
]);

// 쿼리스트링과 #fragment(OAuth 복귀 주소의 code·token 등)를 함께 자른다.
const stripQueryString = (url: string): string => url.split(/[?#]/)[0];

const scrubBreadcrumbData = (data: Breadcrumb["data"]): Breadcrumb["data"] | undefined => {
  if (!data) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_BREADCRUMB_DATA_KEYS) {
    const value = data[key];
    if (value === undefined) continue;
    result[key] = typeof value === "string" ? stripQueryString(value) : value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

// message는 의도적으로 뺀다(사용자 입력이 로그 문자열로 담길 수 있다).
const scrubBreadcrumb = (crumb: Breadcrumb): Breadcrumb => ({
  type: crumb.type,
  category: crumb.category,
  level: crumb.level,
  timestamp: crumb.timestamp,
  data: scrubBreadcrumbData(crumb.data),
});

/**
 * breadcrumb을 기록되는 순간 거른다. RN SDK는 breadcrumb을 추가할 때마다 네이티브 scope에도 복사하므로,
 * beforeSend에서만 거르면 네이티브 크래시 보고에 touch(누른 요소 라벨)·console breadcrumb이 그대로 실린다.
 */
export const filterBreadcrumb = (crumb: Breadcrumb): Breadcrumb | null =>
  ALLOWED_BREADCRUMB_CATEGORIES.has(crumb.category ?? "") ? scrubBreadcrumb(crumb) : null;

/** Sentry로 나가는 이벤트를 허용 필드만으로 다시 만든다(allowlist). */
export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  const scrubbed: ErrorEvent = {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    dist: event.dist,
    message: event.message,
    exception: event.exception,
    fingerprint: event.fingerprint,
    // 소스맵을 debug id로 매칭하는 데 필요하다(prepareEvent가 beforeSend 전에 채운다). 코드 위치 정보뿐이다.
    debug_meta: event.debug_meta,
    tags: event.tags,
    sdk: event.sdk,
  };

  if (event.contexts) {
    scrubbed.contexts = {
      os: event.contexts.os,
      app: event.contexts.app,
      react: event.contexts.react,
    };
  }

  if (event.user?.id !== undefined) {
    scrubbed.user = { id: event.user.id };
  }

  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs.flatMap((crumb) => filterBreadcrumb(crumb) ?? []);
  }

  return scrubbed;
};

/**
 * App.tsx 최상단에서 다른 초기화보다 먼저 부른다. DSN이 없거나 개발 빌드(__DEV__)면 아무것도 안 한다.
 * DSN은 EAS production 환경에만 등록한다(preview·로컬에선 비어 있어 전송되지 않는다).
 */
export const initSentry = (): void => {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn || __DEV__) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    beforeBreadcrumb: (crumb) => filterBreadcrumb(crumb),
    beforeSend: (event) => scrubEvent(event),
  });
};

/**
 * 앱 시작 진행 단계. 네이티브 크래시(WatchdogTermination 등)는 다음 실행 때 네이티브 scope의 breadcrumb과
 * 함께 보고되므로, 어느 단계에서 멈췄는지 구분하는 단서가 된다(11-26 건은 SDK 시작·connectivity뿐이라 구분 불가였다).
 */
export type LifecycleStage = "splash_hold" | "auth_wait_start" | "auth_resolved" | "splash_hide" | "nav_ready";

type LifecycleData = { reason?: "ready" | "failsafe"; signed_in?: boolean };

// breadcrumb 기록이 본래 흐름을 깨면 안 되므로 절대 던지지 않는다. init 전(개발 빌드)엔 아무것도 남지 않는다.
const safeAddBreadcrumb = (crumb: Breadcrumb): void => {
  try {
    Sentry.addBreadcrumb(crumb);
  } catch {
    // 무시한다.
  }
};

/** 진행 단계를 남긴다. message는 스크러빙으로 지워지므로 단계는 data에 담는다. */
export const addLifecycleBreadcrumb = (stage: LifecycleStage, extra?: LifecycleData): void =>
  safeAddBreadcrumb({ category: LIFECYCLE_CATEGORY, type: "info", level: "info", data: { stage, ...extra } });

/**
 * 화면 이동을 남긴다. 화면 이름만 받는다 — route params(할 일 id 등)는 절대 넘기지 않는다.
 * reactNavigationIntegration을 쓰지 않는 이유: 그 통합은 이동마다 내비게이션 span을 만든 뒤에야
 * breadcrumb을 남기는데, 이 앱은 성능 추적(tracing)을 켜지 않으므로 span 수명에 기대지 않고 직접 남긴다.
 */
export const addNavigationBreadcrumb = (from: string | undefined, to: string): void =>
  safeAddBreadcrumb({ category: "navigation", type: "navigation", data: { from, to } });

/** 화면을 깨지 않고 삼켜지는 실패를 보고하는 곳. 웹의 feature 태그와 같은 이름을 쓴다. */
export type SentryFeature = "iap" | "aiPlan" | "entitlement" | "calendar" | "maintenance" | "auth" | "reminder" | "feedback";

/**
 * 실패를 로그로 남기고 Sentry로 보낸다. 오류 보고가 본래 흐름을 깨면 안 되므로 절대 던지지 않는다.
 * init 전(개발 빌드)엔 captureException이 아무것도 보내지 않는다.
 */
export const reportError = (
  error: unknown,
  feature?: SentryFeature,
  extraTags?: Record<string, string>,
): void => {
  console.warn(`[${feature ?? "error"}]`, error);
  try {
    Sentry.captureException(error, feature ? { tags: { feature, ...extraTags } } : undefined);
  } catch {
    // 보고 실패는 무시한다.
  }
};
