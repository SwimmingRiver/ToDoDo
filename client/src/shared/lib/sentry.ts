import * as Sentry from "@sentry/react";
import type { Breadcrumb, ErrorEvent as SentryErrorEvent } from "@sentry/react";

// 기계적으로 생성되는(=사용자가 직접 입력한 텍스트가 들어가지 않는) breadcrumb 카테고리만 허용한다.
// "console"(console.log 인자), "ui.click"/"ui.input"/"dom"(클릭·입력 이벤트, input value 포함 가능)은
// title/description 등 사용자 입력이 섞여 들어올 수 있어 통째로 제외한다.
const ALLOWED_BREADCRUMB_CATEGORIES = new Set(["navigation", "fetch", "xhr"]);

// breadcrumb.data 중에서도 URL/HTTP 메서드/상태코드 등 구조화된 값만 통과시킨다.
// (fetch/xhr breadcrumb의 request body 등은 애초에 Sentry가 기본적으로 담지 않지만, 방어적으로 명시한다.)
const ALLOWED_BREADCRUMB_DATA_KEYS = new Set([
  "url",
  "method",
  "status_code",
  "from",
  "to",
  "request_body_size",
  "response_body_size",
]);

// URL 문자열에서 쿼리스트링을 제거한다. 현재 라우트 쿼리 파라미터에 민감정보가 없는 것을 확인했지만,
// 이후 실수로 쿼리에 토큰/이메일 등이 추가되어도 기본적으로 잘려나가도록 보수적으로 제거한다.
const stripQueryString = (url: string): string => url.split("?")[0];

const scrubBreadcrumbData = (
  data: Breadcrumb["data"],
): Breadcrumb["data"] | undefined => {
  if (!data) return undefined;

  const result: Record<string, unknown> = {};
  for (const key of ALLOWED_BREADCRUMB_DATA_KEYS) {
    const value = data[key];
    if (value === undefined) continue;
    result[key] = typeof value === "string" ? stripQueryString(value) : value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

const scrubBreadcrumb = (crumb: Breadcrumb): Breadcrumb => ({
  type: crumb.type,
  category: crumb.category,
  level: crumb.level,
  timestamp: crumb.timestamp,
  data: scrubBreadcrumbData(crumb.data),
  // message는 의도적으로 제외한다. console breadcrumb 등에서 사용자가 입력한 title/description
  // 문자열이 그대로 로그로 찍혀 message에 담기는 경우를 배제할 수 없기 때문이다.
});

/**
 * Sentry로 전송되는 이벤트를 allowlist 방식으로 재구성한다.
 *
 * denylist("이 필드는 빼자")가 아니라 allowlist("이 필드만 보내자")를 쓰는 이유:
 * Sentry SDK가 버전업되며 이벤트에 새 필드가 추가되거나, 앞으로 코드에서 실수로
 * extra/contexts에 Todo 객체(title, description 포함)를 통째로 넘기는 실수를 해도
 * 여기서 명시적으로 허용하지 않은 필드는 기본적으로 전송 자체가 차단된다.
 *
 * 허용 필드:
 * - message, exception(에러 메시지/스택트레이스): 코드 위치 파악에 필요한 정보이며 사용자 입력이 아니다.
 * - request.url(쿼리스트링 제거): 어떤 페이지에서 에러가 났는지 파악하기 위함.
 * - contexts.browser / contexts.os: Sentry가 기본 수집하는 환경 정보, PII 아님.
 * - contexts.react(componentStack): React가 만들어내는 컴포넌트 트리 문자열로, 사용자 입력 아님.
 * - tags: 문자열/숫자/불리언 원시값만 존재하므로 통째로 허용(문자열 자유 입력 필드가 아님).
 * - user.id: Firebase Auth uid만 허용.
 *
 * 차단 필드(명시적으로 옮겨 담지 않아 자동 제거됨):
 * - request.data: 폼 입력값이 그대로 담길 수 있다.
 * - extra, contexts의 그 외 커스텀 컨텍스트: Todo의 title/description 등이 실수로 담길 위험이 가장 큰 지점.
 * - user.email, user.username: uid 이외의 PII.
 * - breadcrumbs의 "console"/"ui.click"/"ui.input"/"dom" 카테고리: 사용자 입력 텍스트가 섞일 수 있다.
 */
export const scrubEvent = (event: SentryErrorEvent): SentryErrorEvent => {
  const scrubbed: SentryErrorEvent = {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform,
    level: event.level,
    environment: event.environment,
    release: event.release,
    message: event.message,
    exception: event.exception,
    fingerprint: event.fingerprint,
    tags: event.tags,
    sdk: event.sdk,
  };

  if (event.contexts) {
    scrubbed.contexts = {
      browser: event.contexts.browser,
      os: event.contexts.os,
      react: event.contexts.react,
    };
  }

  if (event.request?.url) {
    scrubbed.request = { url: stripQueryString(event.request.url) };
  }

  if (event.user?.id !== undefined) {
    scrubbed.user = { id: event.user.id };
  }

  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs
      .filter((crumb) => ALLOWED_BREADCRUMB_CATEGORIES.has(crumb.category ?? ""))
      .map(scrubBreadcrumb);
  }

  return scrubbed;
};

// main.tsx 최상단(다른 모든 초기화보다 먼저)에서 호출한다.
export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  // DSN이 없는 환경(로컬 개발 등)에서는 init 자체를 생략해 조용히 비활성화한다.
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // dsn을 로컬에 설정해두더라도 실제로는 프로덕션 빌드에서만 전송되도록 이중으로 방어한다.
    enabled: import.meta.env.PROD,
    beforeSend: (event) => scrubEvent(event),
  });
};
